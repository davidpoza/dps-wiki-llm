package com.dpswikillm.services;

/**
 * Raised when an LLM response cannot be parsed into the expected JSON shape.
 * Extends {@link IllegalArgumentException} for backwards compatibility with
 * callers that catch the broader type, while allowing the retry layer to
 * distinguish a bad generation (worth re-requesting) from other errors.
 */
public class LlmResponseFormatException extends IllegalArgumentException {
    public LlmResponseFormatException(String message) {
        super(message);
    }

    public LlmResponseFormatException(String message, Throwable cause) {
        super(message, cause);
    }
}
