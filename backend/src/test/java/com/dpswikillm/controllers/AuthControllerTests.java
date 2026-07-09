package com.dpswikillm.controllers;

import com.dpswikillm.config.PasswordConfig;
import com.dpswikillm.config.SecurityConfig;
import com.dpswikillm.domain.User;
import com.dpswikillm.dto.LoginRequest;
import com.dpswikillm.dto.RegisterRequest;
import com.dpswikillm.repositories.UserRepository;
import com.dpswikillm.security.JwtAuthFilter;
import com.dpswikillm.security.JwtUtil;
import com.dpswikillm.services.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
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

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, PasswordConfig.class, JwtAuthFilter.class})
class AuthControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthenticationManager authenticationManager;

    @MockBean
    private JwtUtil jwtUtil;

    @MockBean
    private UserService userService;

    @MockBean
    private UserRepository userRepository;

    @Test
    void login_validCredentials_returns200WithToken() throws Exception {
        User mockUser = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        var auth = new UsernamePasswordAuthenticationToken(mockUser, null, mockUser.getAuthorities());
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(jwtUtil.generateToken(any())).thenReturn("mock.jwt.token");
        when(jwtUtil.extractExpiration(any())).thenReturn(new java.util.Date());

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("alice", "password"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("mock.jwt.token"))
                .andExpect(jsonPath("$.username").value("alice"));
    }

    @Test
    void login_wrongPassword_returns401() throws Exception {
        when(authenticationManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("bad"));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("alice", "wrong"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "admin", roles = "ADMIN")
    void register_asAdmin_returns201() throws Exception {
        when(userRepository.existsByUsername(anyString())).thenReturn(false);
        when(userRepository.existsByEmail(anyString())).thenReturn(false);
        User created = new User("bob", "bob@test.com", "$2a$hash", "ROLE_USER");
        when(userService.createUser(anyString(), anyString(), anyString(), anyList())).thenReturn(created);

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new RegisterRequest("bob", "bob@test.com", "password123", List.of("ROLE_USER")))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("bob"));
    }

    @Test
    void me_withoutToken_returns401() throws Exception {
        mockMvc.perform(get("/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "alice", roles = "USER")
    void register_asNonAdmin_returns403() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new RegisterRequest("bob", "bob@test.com", "password123", List.of("ROLE_USER")))))
                .andExpect(status().isForbidden());
    }
}
