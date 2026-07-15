package com.dpswikillm.dto;

import java.util.Date;
import java.util.List;

public record AuthResponse(
        String token,
        Date expiresAt,
        String username,
        List<String> roles
) {}
