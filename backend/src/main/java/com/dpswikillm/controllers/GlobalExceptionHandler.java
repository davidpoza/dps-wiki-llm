package com.dpswikillm.controllers;

import java.util.Map;
import org.jsoup.HttpStatusException;
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
}
