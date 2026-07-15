package com.dpswikillm.security;

import com.dpswikillm.config.AppProperties;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import java.util.Base64;
import java.util.Date;
import javax.crypto.SecretKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

@Component
public class JwtUtil {

    private static final Logger log = LoggerFactory.getLogger(JwtUtil.class);

    /** Scope claim for normal API access tokens. */
    public static final String SCOPE_ACCESS = "access";
    /** Scope claim for short-lived tokens that only authorize the 2FA verification step. */
    public static final String SCOPE_2FA = "2fa";
    private static final long CHALLENGE_EXPIRATION_MS = 5 * 60 * 1000L;

    private final SecretKey signingKey;
    private final long expirationMs;

    public JwtUtil(AppProperties appProperties) {
        String secret = appProperties.jwt().secret();
        long expMs = appProperties.jwt().expirationMs();

        if (secret == null || secret.isBlank()) {
            // Generate a random key when no secret is configured (dev/test)
            this.signingKey = Jwts.SIG.HS256.key().build();
            log.warn("JWT_SECRET not configured — using a random ephemeral key. Tokens will not survive restarts.");
        } else {
            byte[] keyBytes = Base64.getDecoder().decode(secret);
            if (keyBytes.length < 32) {
                throw new IllegalStateException("JWT_SECRET must be at least 32 bytes (256 bits) when base64-decoded.");
            }
            this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        }
        this.expirationMs = expMs;
    }

    public String generateToken(UserDetails userDetails) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        String roles = userDetails.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .reduce((a, b) -> a + "," + b)
                .orElse("");
        return Jwts.builder()
                .subject(userDetails.getUsername())
                .claim("roles", roles)
                .claim("scope", SCOPE_ACCESS)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey)
                .compact();
    }

    /**
     * Short-lived token issued after a valid password when 2FA is enabled. It only
     * authorizes the {@code /auth/login/2fa} verification step and is rejected by
     * {@link JwtAuthFilter} for API access (scope != access).
     */
    public String generateChallengeToken(String username) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + CHALLENGE_EXPIRATION_MS);
        return Jwts.builder()
                .subject(username)
                .claim("scope", SCOPE_2FA)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey)
                .compact();
    }

    public String extractScope(String token) {
        Object scope = parseClaims(token).getPayload().get("scope");
        return scope == null ? null : scope.toString();
    }

    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Invalid JWT: {}", e.getMessage());
            return false;
        }
    }

    public String extractUsername(String token) {
        return parseClaims(token).getPayload().getSubject();
    }

    public Date extractExpiration(String token) {
        return parseClaims(token).getPayload().getExpiration();
    }

    private Jws<Claims> parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token);
    }
}
