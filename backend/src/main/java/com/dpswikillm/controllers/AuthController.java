package com.dpswikillm.controllers;

import com.dpswikillm.domain.User;
import com.dpswikillm.dto.AuthResponse;
import com.dpswikillm.dto.LoginRequest;
import com.dpswikillm.dto.RegisterRequest;
import com.dpswikillm.repositories.UserRepository;
import com.dpswikillm.security.JwtUtil;
import com.dpswikillm.services.UserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtUtil jwtUtil;
    private final UserService userService;
    private final UserRepository userRepository;

    public AuthController(AuthenticationManager authenticationManager,
                          JwtUtil jwtUtil,
                          UserService userService,
                          UserRepository userRepository) {
        this.authenticationManager = authenticationManager;
        this.jwtUtil = jwtUtil;
        this.userService = userService;
        this.userRepository = userRepository;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            Authentication auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password()));
            UserDetails userDetails = (UserDetails) auth.getPrincipal();
            String token = jwtUtil.generateToken(userDetails);
            List<String> roles = userDetails.getAuthorities().stream()
                    .map(a -> a.getAuthority())
                    .toList();
            return ResponseEntity.ok(new AuthResponse(token, jwtUtil.extractExpiration(token), userDetails.getUsername(), roles));
        } catch (BadCredentialsException | DisabledException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid credentials"));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal User user) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "email", user.getEmail(),
                "roles", user.getRoleList()
        ));
    }

    @PostMapping("/register")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Username already exists"));
        }
        if (userRepository.existsByEmail(request.email())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Email already exists"));
        }
        List<String> roles = (request.roles() != null && !request.roles().isEmpty())
                ? request.roles()
                : List.of("ROLE_USER");
        User created = userService.createUser(request.username(), request.email(), request.password(), roles);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("id", created.getId(), "username", created.getUsername()));
    }
}
