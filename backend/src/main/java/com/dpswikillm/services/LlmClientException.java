package com.dpswikillm.services;

public class LlmClientException extends RuntimeException {
    private final boolean retryable;

    public LlmClientException(String message, boolean retryable) {
        super(message);
        this.retryable = retryable;
    }

    public LlmClientException(String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.retryable = retryable;
    }

    public boolean retryable() {
        return retryable;
    }
}
