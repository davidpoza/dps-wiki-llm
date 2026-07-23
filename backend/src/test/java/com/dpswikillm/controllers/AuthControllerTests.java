package com.dpswikillm.controllers;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.dpswikillm.config.PasswordConfig;
import com.dpswikillm.config.SecurityConfig;
import com.dpswikillm.domain.User;
import com.dpswikillm.dto.ChangePasswordRequest;
import com.dpswikillm.dto.LoginRequest;
import com.dpswikillm.dto.RegisterRequest;
import com.dpswikillm.dto.TwoFactorLoginRequest;
import com.dpswikillm.repositories.UserRepository;
import com.dpswikillm.security.JwtAuthFilter;
import com.dpswikillm.security.JwtUtil;
import com.dpswikillm.security.TotpService;
import com.dpswikillm.services.LoginEventService;
import com.dpswikillm.services.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, PasswordConfig.class, JwtAuthFilter.class})
class AuthControllerTests {

    @Autowired private MockMvc mockMvc;

    @Autowired private ObjectMapper objectMapper;

    @MockBean private AuthenticationManager authenticationManager;

    @MockBean private JwtUtil jwtUtil;

    @MockBean private UserService userService;

    @MockBean private UserRepository userRepository;

    @MockBean private TotpService totpService;

    @MockBean private LoginEventService loginEventService;

    @Test
    void login_validCredentials_returns200WithToken() throws Exception {
        User mockUser = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        var auth =
                new UsernamePasswordAuthenticationToken(mockUser, null, mockUser.getAuthorities());
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(jwtUtil.generateToken(any())).thenReturn("mock.jwt.token");
        when(jwtUtil.extractExpiration(any())).thenReturn(new java.util.Date());

        mockMvc.perform(
                        post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new LoginRequest("alice", "password"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("mock.jwt.token"))
                .andExpect(jsonPath("$.username").value("alice"));
    }

    @Test
    void login_with2faEnabled_returnsChallengeNotToken() throws Exception {
        User mockUser = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        mockUser.setTwoFactorEnabled(true);
        mockUser.setTwoFactorSecret("SECRET");
        var auth =
                new UsernamePasswordAuthenticationToken(mockUser, null, mockUser.getAuthorities());
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(jwtUtil.generateChallengeToken("alice")).thenReturn("challenge.token");

        mockMvc.perform(
                        post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new LoginRequest("alice", "password"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.twoFactorRequired").value(true))
                .andExpect(jsonPath("$.challengeToken").value("challenge.token"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void loginTwoFactor_validCode_returnsToken() throws Exception {
        User mockUser = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        mockUser.setTwoFactorEnabled(true);
        mockUser.setTwoFactorSecret("SECRET");
        when(jwtUtil.validateToken("challenge.token")).thenReturn(true);
        when(jwtUtil.extractScope("challenge.token")).thenReturn(JwtUtil.SCOPE_2FA);
        when(jwtUtil.extractUsername("challenge.token")).thenReturn("alice");
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(mockUser));
        when(totpService.isValidCode("SECRET", "123456")).thenReturn(true);
        when(jwtUtil.generateToken(any())).thenReturn("mock.jwt.token");
        when(jwtUtil.extractExpiration(any())).thenReturn(new java.util.Date());

        mockMvc.perform(
                        post("/auth/login/2fa")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new TwoFactorLoginRequest(
                                                        "challenge.token", "123456"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("mock.jwt.token"));
    }

    @Test
    void loginTwoFactor_invalidCode_returns401() throws Exception {
        User mockUser = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        mockUser.setTwoFactorEnabled(true);
        mockUser.setTwoFactorSecret("SECRET");
        when(jwtUtil.validateToken("challenge.token")).thenReturn(true);
        when(jwtUtil.extractScope("challenge.token")).thenReturn(JwtUtil.SCOPE_2FA);
        when(jwtUtil.extractUsername("challenge.token")).thenReturn("alice");
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(mockUser));
        when(totpService.isValidCode("SECRET", "000000")).thenReturn(false);

        mockMvc.perform(
                        post("/auth/login/2fa")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new TwoFactorLoginRequest(
                                                        "challenge.token", "000000"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void login_wrongPassword_returns401() throws Exception {
        when(authenticationManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("bad"));

        mockMvc.perform(
                        post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new LoginRequest("alice", "wrong"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "admin", roles = "ADMIN")
    void register_asAdmin_returns201() throws Exception {
        when(userRepository.existsByUsername(anyString())).thenReturn(false);
        when(userRepository.existsByEmail(anyString())).thenReturn(false);
        User created = new User("bob", "bob@test.com", "$2a$hash", "ROLE_USER");
        when(userService.createUser(anyString(), anyString(), anyString(), anyList()))
                .thenReturn(created);

        mockMvc.perform(
                        post("/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new RegisterRequest(
                                                        "bob",
                                                        "bob@test.com",
                                                        "password123",
                                                        List.of("ROLE_USER")))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("bob"));
    }

    @Test
    void me_withoutToken_returns401() throws Exception {
        mockMvc.perform(get("/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "alice", roles = "USER")
    void register_asNonAdmin_returns403() throws Exception {
        mockMvc.perform(
                        post("/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new RegisterRequest(
                                                        "bob",
                                                        "bob@test.com",
                                                        "password123",
                                                        List.of("ROLE_USER")))))
                .andExpect(status().isForbidden());
    }

    private static UsernamePasswordAuthenticationToken principal(User user) {
        return new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
    }

    @Test
    void changePassword_validCurrentPassword_returns200() throws Exception {
        User user = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        when(userService.matchesPassword("current", "$2a$hash")).thenReturn(true);

        mockMvc.perform(
                        post("/auth/password")
                                .with(authentication(principal(user)))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new ChangePasswordRequest(
                                                        "current", "newpassword"))))
                .andExpect(status().isOk());
        verify(userService).changePassword("alice", "newpassword");
    }

    @Test
    void changePassword_wrongCurrentPassword_returns401() throws Exception {
        User user = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        when(userService.matchesPassword("wrong", "$2a$hash")).thenReturn(false);

        mockMvc.perform(
                        post("/auth/password")
                                .with(authentication(principal(user)))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new ChangePasswordRequest("wrong", "newpassword"))))
                .andExpect(status().isUnauthorized());
        verify(userService, never()).changePassword(anyString(), anyString());
    }

    @Test
    void changePassword_invalidNewPassword_returns400() throws Exception {
        User user = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");

        mockMvc.perform(
                        post("/auth/password")
                                .with(authentication(principal(user)))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        objectMapper.writeValueAsString(
                                                new ChangePasswordRequest("current", "short"))))
                .andExpect(status().isBadRequest());
    }
}
