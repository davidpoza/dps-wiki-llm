/**
 * @module local-transformers-provider
 *
 * CPU-local embedding provider backed by `@xenova/transformers` (ONNX Runtime).
 *
 * Role in the pipeline:
 *   Implements `EmbeddingProvider` for both `embed-index` (offline batch
 *   embedding) and `semantic-search` (online query embedding).  Models are
 *   downloaded from the Hugging Face Hub on first use and cached locally; all
 *   subsequent runs are fully offline.
 *
 * Reads:  SYSTEM_CONFIG.semantic.{model, batchSize} from config.
 * Writes: Nothing directly; the @xenova/transformers library manages its own
 *         model cache directory (~/.cache/huggingface by default).
 *
 * Why dynamic import?
 *   `@xenova/transformers` performs significant work at module initialisation
 *   (WASM bootstrap, environment detection).  A static top-level import would
 *   run that code even for callers that never call `embed`, inflating cold-start
 *   time and preventing tree-shaking.  The dynamic `import()` inside
 *   `loadPipeline` defers all of that until the first actual embedding request.
 */

import type { EmbeddingProvider } from "./embedding-provider.js";
import { createLogger } from "./logger.js";
import { SYSTEM_CONFIG } from "../config.js";

// Module-level logger — created lazily on the first embedding call so the
// vault path is already resolved from argv at that point.
let log: ReturnType<typeof createLogger> | null = null;
function getLog(): ReturnType<typeof createLogger> {
  if (!log) log = createLogger("embedding-provider");
  return log;
}

// ── Module-level singletons ────────────────────────────────────────────────────
// Stored at module scope so that successive calls within the same process reuse
// the already-loaded ONNX session rather than reloading weights from disk.

/** The loaded feature-extraction pipeline, or null before first use. */
let pipelineInstance: ((texts: string[], options?: Record<string, unknown>) => Promise<unknown>) | null = null;

/** The model identifier that was used to create `pipelineInstance`. */
let resolvedModel: string | null = null;

/**
 * The true vector dimension discovered from the first embed call.
 * Null until the first call completes; the `dimension` getter returns a
 * conservative default of 1024 in the meantime.
 */
let resolvedDimension: number | null = null;

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Ensure the `@xenova/transformers` pipeline is initialised for `model`.
 * Subsequent calls with the same model name are no-ops (singleton pattern).
 *
 * Why `quantized: true`?
 *   The quantised (INT8) ONNX weights are ~4× smaller than FP32 and run
 *   significantly faster on CPU with negligible quality degradation for
 *   retrieval tasks.  This matters because embedding runs entirely on CPU
 *   in this stack.
 *
 * @param model - Hugging Face model identifier, e.g. "Xenova/bge-m3".
 */
async function loadPipeline(model: string): Promise<void> {
  if (pipelineInstance && resolvedModel === model) return;

  const logger = getLog();
  logger.info(
    { phase: "model-load", model, quantized: true },
    "embedding-provider: loading ONNX pipeline (first use or model change)"
  );

  const loadStart = Date.now();

  // Dynamic import keeps this optional at compile time.
  const { pipeline, env } = await import("@xenova/transformers");

  // Run fully offline after first download (no telemetry).
  env.allowRemoteModels = true;
  env.useBrowserCache = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipelineInstance = await (pipeline as (task: string, model: string, opts?: Record<string, unknown>) => Promise<any>)("feature-extraction", model, { quantized: true }) as (texts: string[], options?: Record<string, unknown>) => Promise<unknown>;
  resolvedModel = model;
  resolvedDimension = null; // probe on first embed

  logger.info(
    { phase: "model-load", model, duration_ms: Date.now() - loadStart },
    "embedding-provider: pipeline ready"
  );
}

/**
 * Compute the L2 norm of a vector — useful as a sanity check on model output.
 * L2-normalised vectors (produced when `normalize: true` is passed) should
 * have a norm of 1.0 ± floating-point epsilon.
 */
function l2Norm(vec: number[]): number {
  let sum = 0;
  for (const v of vec) sum += v * v;
  return Math.sqrt(sum);
}

/**
 * Convert the raw output of a `@xenova/transformers` feature-extraction
 * pipeline call into a single flat embedding vector via mean pooling.
 *
 * What is mean pooling?
 *   Transformer models output one hidden-state vector per input token,
 *   yielding a tensor of shape [batch, seq_len, dim].  To obtain a single
 *   fixed-size document vector we average ("pool") across the seq_len axis.
 *   This is the standard approach for bi-encoder retrieval models such as
 *   BGE/E5/Sentence-Transformers.
 *
 * Two output shapes are handled to cover different model versions:
 *   1. Objects with a `.tolist()` method — older @xenova/transformers API.
 *      `nested[0]` is an array of per-token arrays; we sum and divide.
 *   2. Objects with `.data` (Float32Array) and `.dims` (number[]) —
 *      the tensor-like API used by newer versions.
 *      - dims.length === 3 → [batch, seq_len, dim]: mean-pool over seq_len.
 *      - dims.length === 2 → [batch, dim]: already pooled; return as-is.
 *
 * @param output - Raw value returned by the pipeline call.
 * @returns A single embedding vector as a plain `number[]`.
 * @throws {Error} If the output shape cannot be parsed.
 */
function extractVector(output: unknown): number[] {
  // Output shape is typically [1, seq_len, dim] – mean-pool over seq_len dimension.
  const data = output as { data?: Float32Array; dims?: number[] } & { tolist?: () => unknown };

  if (typeof data?.tolist === "function") {
    const nested = data.tolist() as unknown[][][];
    // nested[0] => [seq_tokens][dim] – mean pool
    const tokens = nested[0];
    const dim = tokens[0].length;
    const result = new Array<number>(dim).fill(0);

    for (const token of tokens) {
      for (let i = 0; i < dim; i++) result[i] += token[i] as number;
    }

    // Divide each dimension by the number of tokens to compute the mean.
    for (let i = 0; i < dim; i++) result[i] /= tokens.length;
    return result;
  }

  if (data?.data && data?.dims) {
    const flat = Array.from(data.data) as number[];
    const dims = data.dims;

    if (dims.length === 3) {
      // Layout: flat[batch * seqLen * dim + t * dim + d]
      // batch=0 is always the single input we pass, so index as [0][t][d].
      const [, seqLen, dim] = dims;
      const result = new Array<number>(dim).fill(0);

      for (let t = 0; t < seqLen; t++) {
        for (let d = 0; d < dim; d++) {
          result[d] += flat[t * dim + d];
        }
      }

      // Mean over sequence length.
      for (let d = 0; d < dim; d++) result[d] /= seqLen;
      return result;
    }

    if (dims.length === 2) {
      // Already pooled by the model (e.g. CLS-pooling models); return directly.
      return flat;
    }
  }

  throw new Error("Cannot extract embedding vector from unexpected output shape");
}

// ── Public factory ─────────────────────────────────────────────────────────────

/**
 * Create an `EmbeddingProvider` that runs inference locally using
 * `@xenova/transformers` (ONNX Runtime, CPU).
 *
 * The provider is a lightweight object; model weights are not loaded until
 * the first `embed` call.  Multiple calls to this factory with the same
 * model name share the same underlying pipeline singleton.
 *
 * @param model - Hugging Face model identifier to use for embeddings.
 *                Defaults to `SYSTEM_CONFIG.semantic.model`.
 * @returns An `EmbeddingProvider` ready for use.
 *
 * @example
 * const provider = createLocalTransformersProvider();
 * const [vec] = await provider.embed(["Hello world"]);
 * console.log(vec.length); // e.g. 1024 for bge-m3
 */
export function createLocalTransformersProvider(
  model = SYSTEM_CONFIG.semantic.model
): EmbeddingProvider {
  return {
    model,

    /**
     * Returns the embedding dimension once probed from the first `embed` call,
     * or 1024 as a safe default before that.  The manifest stores this value
     * so index consumers know vector size without loading any embeddings.
     */
    get dimension(): number {
      return resolvedDimension ?? 1024;
    },

    /**
     * Embed an array of texts, processing them in batches to bound peak
     * memory usage.  Batch size is governed by `SYSTEM_CONFIG.semantic.batchSize`.
     *
     * Each text is embedded individually within the batch loop because the
     * `@xenova/transformers` pipeline pads variable-length sequences, and
     * batching short + long texts together can distort attention masks on
     * some model versions.
     *
     * Logs one structured entry per individual inference call with:
     *   - model, input_chars, input_preview (first 120 chars of normalised text)
     *   - duration_ms, output_dim, output_norm (L2 norm; ≈1.0 for normalised vectors)
     *
     * @param texts - Plain-text strings to embed (markup should be stripped
     *                before calling; see `normalizeTextForEmbedding`).
     * @returns Parallel array of embedding vectors in input order.
     */
    async embed(texts: string[]): Promise<number[][]> {
      await loadPipeline(model);

      const logger = getLog();
      const result: number[][] = [];

      // Process in batches to bound memory usage.
      const batchSize = SYSTEM_CONFIG.semantic.batchSize;

      for (let start = 0; start < texts.length; start += batchSize) {
        const batch = texts.slice(start, start + batchSize);

        for (const text of batch) {
          const inferenceStart = Date.now();

          // ── Embedding call ──────────────────────────────────────────────────
          // This is the complete call to the local inference model.
          // Input: plain-text string (frontmatter and markup already stripped).
          // Options: pooling=mean collapses the per-token tensor to one vector;
          //          normalize=true L2-normalises the result to unit sphere.
          // @ts-expect-error – runtime shape varies by model version
          const output = await pipelineInstance!(text, { pooling: "mean", normalize: true });
          // ───────────────────────────────────────────────────────────────────

          const vec = extractVector(output);
          const duration_ms = Date.now() - inferenceStart;

          // Probe the true dimension from the first successful embedding.
          if (resolvedDimension === null) resolvedDimension = vec.length;

          logger.info(
            {
              phase: "inference",
              model,
              input_chars: text.length,
              input_preview: text.slice(0, 120),
              options: { pooling: "mean", normalize: true },
              duration_ms,
              output_dim: vec.length,
              output_norm: Number(l2Norm(vec).toFixed(6))
            },
            "embedding-provider: inference completed"
          );

          result.push(vec);
        }
      }

      return result;
    }
  };
}
