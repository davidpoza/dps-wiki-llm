package com.dpswikillm.controllers;

import java.time.Instant;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PlatformController {
    @GetMapping("/platform")
    public PlatformStatus platform() {
        return new PlatformStatus("dps-wiki-llm", Instant.now());
    }

    public record PlatformStatus(String name, Instant serverTime) {}
}
