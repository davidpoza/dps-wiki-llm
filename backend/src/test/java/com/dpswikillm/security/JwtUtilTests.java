package com.dpswikillm.security;

import com.dpswikillm.config.AppProperties;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import static org.assertj.core.api.Assertions.assertThat;

class JwtUtilTests {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        // 32-byte secret for HS256
        String secret = Base64.getEncoder().encodeToString(new byte[32]);
        AppProperties props = new AppProperties(
                "/vault",
                List.of(),
                null, null, null,
                new AppProperties.Jwt(secret, 3600000L),
                new AppProperties.Admin("", ""), null, null
        );
        jwtUtil = new JwtUtil(props);
    }

    private UserDetails user(String username) {
        return User.withUsername(username)
                .password("ignored")
                .roles("USER")
                .build();
    }

    @Test
    void generateToken_returnsNonBlankToken() {
        String token = jwtUtil.generateToken(user("alice"));
        assertThat(token).isNotBlank();
    }

    @Test
    void extractUsername_returnsCorrectUsername() {
        String token = jwtUtil.generateToken(user("alice"));
        assertThat(jwtUtil.extractUsername(token)).isEqualTo("alice");
    }

    @Test
    void validateToken_validToken_returnsTrue() {
        String token = jwtUtil.generateToken(user("alice"));
        assertThat(jwtUtil.validateToken(token)).isTrue();
    }

    @Test
    void validateToken_tamperedToken_returnsFalse() {
        String token = jwtUtil.generateToken(user("alice"));
        String tampered = token.substring(0, token.length() - 4) + "XXXX";
        assertThat(jwtUtil.validateToken(tampered)).isFalse();
    }

    @Test
    void validateToken_expiredToken_returnsFalse() throws Exception {
        // Create util with -1ms expiry (already expired)
        String secret = Base64.getEncoder().encodeToString(new byte[32]);
        AppProperties propsExpired = new AppProperties(
                "/vault",
                List.of(),
                null, null, null,
                new AppProperties.Jwt(secret, -1L),
                new AppProperties.Admin("", ""), null, null
        );
        JwtUtil expiredJwtUtil = new JwtUtil(propsExpired);
        String token = expiredJwtUtil.generateToken(user("alice"));
        assertThat(expiredJwtUtil.validateToken(token)).isFalse();
    }
}
