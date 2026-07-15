package com.dpswikillm.dto;

public record TwoFactorSetupResponse(
        String secret,
        String otpauthUri,
        String qrDataUri
) {}
