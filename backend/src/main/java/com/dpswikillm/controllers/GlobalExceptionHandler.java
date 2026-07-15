package com.dpswikillm.controllers;

import com.dpswikillm.services.WebExtractionException;
import java.util.Map;
import org.jsoup.HttpStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(HttpStatusException.class)
    public ResponseEntity<Map<String, String>> handleUrlFetchError(HttpStatusException ex) {
        return ResponseEntity.unprocessableEntity()
                .body(Map.of("error", "URL fetch failed with HTTP " + ex.getStatusCode() + ": " + ex.getUrl()));
    }

    @ExceptionHandler(WebExtractionException.class)
    public ResponseEntity<Map<String, String>> handleWebExtraction(WebExtractionException ex) {
        HttpStatus status = "service_unavailable".equals(ex.getCode())
                ? HttpStatus.SERVICE_UNAVAILABLE
                : HttpStatus.UNPROCESSABLE_ENTITY;
        return ResponseEntity.status(status)
                .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
    }
}
