package com.dpswikillm.services;

/**
 * Raised when the web-extractor microservice cannot produce content for a URL,
 * or is unreachable. {@code code} mirrors the microservice's typed error codes
 * (e.g. {@code timeout}, {@code unsupported_content_type}, {@code navigation_failed},
 * {@code empty_content}) or {@code service_unavailable} when the call itself fails.
 */
public class WebExtractionException extends RuntimeException {
    private final String code;

    public WebExtractionException(String code, String message) {
        super(message);
        this.code = code;
    }

    public WebExtractionException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
