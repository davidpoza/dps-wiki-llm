package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.User;
import com.dpswikillm.repositories.UserRepository;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTests {

    @Mock
    private UserRepository userRepository;

    private PasswordEncoder passwordEncoder;
    private UserService userService;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();
        AppProperties props = new AppProperties(
                Path.of("/vault"),
                List.of(),
                null, null, null,
                new AppProperties.Jwt("", 86400000L),
                new AppProperties.Admin("admin", "secret"), null
        );
        userService = new UserService(userRepository, passwordEncoder, props);
    }

    @Test
    void createUser_encodesPassword() {
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        User user = userService.createUser("alice", "alice@test.com", "plaintext", List.of("ROLE_USER"));
        assertThat(user.getPassword()).startsWith("$2a$");
        assertThat(user.getPassword()).isNotEqualTo("plaintext");
    }

    @Test
    void createUser_setsCorrectRoles() {
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        User user = userService.createUser("alice", "alice@test.com", "pass", List.of("ROLE_USER", "ROLE_ADMIN"));
        assertThat(user.getRoles()).contains("ROLE_USER").contains("ROLE_ADMIN");
    }

    @Test
    void seedAdmin_createsAdminWhenNotExists() {
        when(userRepository.existsByUsername("admin")).thenReturn(false);
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        userService.seedAdmin();
        verify(userRepository, times(1)).save(any());
    }

    @Test
    void seedAdmin_isIdempotent_whenAdminAlreadyExists() {
        when(userRepository.existsByUsername("admin")).thenReturn(true);
        userService.seedAdmin();
        verify(userRepository, never()).save(any());
    }

    @Test
    void loadUserByUsername_returnsUser_whenExists() {
        User mockUser = new User("alice", "alice@test.com", "$2a$10$hash", "ROLE_USER");
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(mockUser));
        UserDetails details = userService.loadUserByUsername("alice");
        assertThat(details.getUsername()).isEqualTo("alice");
    }

    @Test
    void loadUserByUsername_throws_whenNotFound() {
        when(userRepository.findByUsername("unknown")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> userService.loadUserByUsername("unknown"))
                .isInstanceOf(UsernameNotFoundException.class);
    }
}
