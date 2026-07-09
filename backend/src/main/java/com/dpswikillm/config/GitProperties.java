package com.dpswikillm.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.git")
public record GitProperties(String userName, String userEmail) {
    public GitProperties {
        if (userName == null || userName.isBlank()) {
            userName = "dps-wiki-llm";
        }
        if (userEmail == null || userEmail.isBlank()) {
            userEmail = "dps-wiki-llm@example.local";
        }
    }
}
