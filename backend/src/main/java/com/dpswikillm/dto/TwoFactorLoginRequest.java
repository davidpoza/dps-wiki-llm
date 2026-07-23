package com.dpswikillm.dto;

import jakarta.validation.constraints.NotBlank;

public record TwoFactorLoginRequest(@NotBlank String challengeToken, @NotBlank String code) {}
