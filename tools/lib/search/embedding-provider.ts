/**
 * @module embedding-provider
 *
 * Defines the `EmbeddingProvider` interface — the single abstraction point
 * for all text-embedding models used in this pipeline.
 *
 * Role in the pipeline:
 *   Both `embed-index` (index building) and `semantic-search` (query-time)
 *   accept an `EmbeddingProvider` so the underlying model implementation can
 *   be swapped (e.g. local ONNX via @xenova/transformers, a remote API, or a
 *   stub for tests) without changing any calling code.
 *
 * Nothing is read from or written to disk by this module; it is a pure
 * type/contract definition.
 */

/**
 * Contract that every embedding backend must satisfy.
 *
 * @example
 * // Implementing a minimal stub for tests:
 * const stub: EmbeddingProvider = {
 *   model: "stub",
 *   dimension: 4,
 *   async embed(texts) {
 *     return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
 *   }
 * };
 */
export interface EmbeddingProvider {
  /**
   * Human-readable model identifier used for provenance tracking.
   * Written into `manifest.json` so that a model change is detectable
   * and can trigger a full index rebuild.
   *
   * @example "Xenova/bge-m3"
   */
  model: string;

  /**
   * Dimensionality of the embedding vectors produced by this model.
   * Stored in the manifest and used to validate index compatibility.
   * May be a conservative default until the first `embed` call resolves
   * the true dimension from the model output.
   */
  dimension: number;

  /**
   * Embed one or more plain-text strings into dense vectors.
   *
   * Implementations must preserve input order: `result[i]` is the
   * embedding for `texts[i]`.  All vectors in the returned array must
   * share the same dimensionality.
   *
   * @param texts - Array of pre-normalised plain-text strings to embed.
   *                Callers are responsible for stripping markup before
   *                passing text here (see `normalizeTextForEmbedding`).
   * @returns Promise resolving to a parallel array of embedding vectors,
   *          one `number[]` of length `dimension` per input string.
   *
   * @example
   * const [[vec]] = await provider.embed(["Hello world"]);
   * // vec is a number[] of length provider.dimension
   */
  embed(texts: string[]): Promise<number[][]>;
}
