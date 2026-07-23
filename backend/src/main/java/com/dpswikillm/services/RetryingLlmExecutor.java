package com.dpswikillm.services;

import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

@Component
public class RetryingLlmExecutor {
    private static final int DEFAULT_MAX_ATTEMPTS = 3;
    private static final Duration DEFAULT_BACKOFF = Duration.ofMillis(200);

    public <T> T execute(Supplier<T> operation) {
        LlmClientException last = null;
        for (int attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
            try {
                return operation.get();
            } catch (LlmClientException ex) {
                if (!ex.retryable()) {
                    throw ex;
                }
                last = ex;
                if (attempt == DEFAULT_MAX_ATTEMPTS) {
                    break;
                }
                sleep(DEFAULT_BACKOFF.multipliedBy(1L << (attempt - 1)));
            }
        }
        throw last == null ? new LlmClientException("LLM call failed", true) : last;
    }

    /**
     * Retry a generate-and-parse operation when the model returns a malformed response ({@link
     * LlmResponseFormatException}). Each attempt re-runs the whole supplier, producing a fresh
     * generation. Transport-level retries are handled independently by the underlying {@link
     * LlmClient}.
     */
    public <T> T executeParsing(Supplier<T> operation) {
        LlmResponseFormatException last = null;
        for (int attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
            try {
                return operation.get();
            } catch (LlmResponseFormatException ex) {
                last = ex;
                if (attempt == DEFAULT_MAX_ATTEMPTS) {
                    break;
                }
                sleep(DEFAULT_BACKOFF.multipliedBy(1L << (attempt - 1)));
            }
        }
        throw last;
    }

    private void sleep(Duration duration) {
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new LlmClientException("Interrupted while waiting to retry LLM call", ex, true);
        }
    }
}
