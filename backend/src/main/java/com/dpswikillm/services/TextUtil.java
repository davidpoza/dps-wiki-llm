package com.dpswikillm.services;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.Locale;

final class TextUtil {
    private TextUtil() {}

    static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    static String slugify(String value, String fallback) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (normalized.isBlank()) {
            return fallback;
        }
        return normalized.length() > 80 ? normalized.substring(0, 80).replaceAll("-+$", "") : normalized;
    }

    static String firstHeadingOrFilename(String content, String fallback) {
        for (String line : content.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("# ")) {
                return trimmed.substring(2).trim();
            }
            if (!trimmed.isBlank() && !trimmed.startsWith("---")) {
                return trimmed.length() > 80 ? trimmed.substring(0, 80) : trimmed;
            }
        }
        return fallback;
    }
}
