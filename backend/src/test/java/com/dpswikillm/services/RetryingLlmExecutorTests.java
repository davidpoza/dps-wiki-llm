package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RetryingLlmExecutorTests {
    private final RetryingLlmExecutor executor = new RetryingLlmExecutor();

    @Test
    void retriesRetryableFailures() {
        AtomicInteger attempts = new AtomicInteger();

        String result = executor.execute(() -> {
            if (attempts.incrementAndGet() < 3) {
                throw new LlmClientException("rate limited", true);
            }
            return "ok";
        });

        assertThat(result).isEqualTo("ok");
        assertThat(attempts).hasValue(3);
    }

    @Test
    void clientErrorsFailFast() {
        AtomicInteger attempts = new AtomicInteger();

        assertThatThrownBy(() -> executor.execute(() -> {
            attempts.incrementAndGet();
            throw new LlmClientException("bad request", false);
        })).isInstanceOf(LlmClientException.class);

        assertThat(attempts).hasValue(1);
    }
}
