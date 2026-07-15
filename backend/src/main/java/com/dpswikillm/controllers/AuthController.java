package com.dpswikillm.controllers;

import com.dpswikillm.domain.User;
import com.dpswikillm.dto.AuthResponse;
import com.dpswikillm.dto.ChangePasswordRequest;
import com.dpswikillm.dto.LoginRequest;
import com.dpswikillm.dto.RegisterRequest;
import com.dpswikillm.dto.TwoFactorChallengeResponse;
import com.dpswikillm.dto.TwoFactorCodeRequest;
import com.dpswikillm.dto.TwoFactorLoginRequest;
import com.dpswikillm.dto.TwoFactorSetupResponse;
import com.dpswikillm.repositories.UserRepository;
import com.dpswikillm.security.JwtUtil;
import com.dpswikillm.security.TotpService;
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
    private final TotpService totpService;

    public AuthController(AuthenticationManager authenticationManager,
                          JwtUtil jwtUtil,
                          UserService userService,
                          UserRepository userRepository,
                          TotpService totpService) {
        this.authenticationManager = authenticationManager;
        this.jwtUtil = jwtUtil;
        this.userService = userService;
        this.userRepository = userRepository;
        this.totpService = totpService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            Authentication auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password()));
            UserDetails userDetails = (UserDetails) auth.getPrincipal();
            if (userDetails instanceof User user && user.isTwoFactorEnabled()) {
                String challengeToken = jwtUtil.generateChallengeToken(user.getUsername());
                return ResponseEntity.ok(TwoFactorChallengeResponse.required(challengeToken));
            }
            return ResponseEntity.ok(buildAuthResponse(userDetails));
        } catch (BadCredentialsException | DisabledException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid credentials"));
        }
    }

    @PostMapping("/login/2fa")
    public ResponseEntity<?> loginTwoFactor(@Valid @RequestBody TwoFactorLoginRequest request) {
        if (!jwtUtil.validateToken(request.challengeToken())
                || !JwtUtil.SCOPE_2FA.equals(jwtUtil.extractScope(request.challengeToken()))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid or expired challenge"));
        }
        String username = jwtUtil.extractUsername(request.challengeToken());
        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null || !user.isTwoFactorEnabled()
                || !totpService.isValidCode(user.getTwoFactorSecret(), request.code())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid code"));
        }
        return ResponseEntity.ok(buildAuthResponse(user));
    }

    private AuthResponse buildAuthResponse(UserDetails userDetails) {
        String token = jwtUtil.generateToken(userDetails);
        List<String> roles = userDetails.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .toList();
        return new AuthResponse(token, jwtUtil.extractExpiration(token), userDetails.getUsername(), roles);
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
                "roles", user.getRoleList(),
                "twoFactorEnabled", user.isTwoFactorEnabled()
        ));
    }

    @PostMapping("/password")
    public ResponseEntity<?> changePassword(@AuthenticationPrincipal User user,
                                            @Valid @RequestBody ChangePasswordRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!userService.matchesPassword(request.currentPassword(), user.getPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Current password is incorrect"));
        }
        userService.changePassword(user.getUsername(), request.newPassword());
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setupTwoFactor(@AuthenticationPrincipal User user) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String secret = totpService.generateSecret();
        userService.storeTwoFactorSecret(user.getUsername(), secret);
        return ResponseEntity.ok(new TwoFactorSetupResponse(
                secret,
                totpService.otpauthUri(user.getUsername(), secret),
                totpService.qrDataUri(user.getUsername(), secret)));
    }

    @PostMapping("/2fa/confirm")
    public ResponseEntity<?> confirmTwoFactor(@AuthenticationPrincipal User user,
                                              @Valid @RequestBody TwoFactorCodeRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (user.getTwoFactorSecret() == null || !totpService.isValidCode(user.getTwoFactorSecret(), request.code())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Invalid code"));
        }
        userService.enableTwoFactor(user.getUsername());
        return ResponseEntity.ok(Map.of("twoFactorEnabled", true));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disableTwoFactor(@AuthenticationPrincipal User user,
                                              @Valid @RequestBody TwoFactorCodeRequest request) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!user.isTwoFactorEnabled()
                || !totpService.isValidCode(user.getTwoFactorSecret(), request.code())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Invalid code"));
        }
        userService.disableTwoFactor(user.getUsername());
        return ResponseEntity.ok(Map.of("twoFactorEnabled", false));
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
