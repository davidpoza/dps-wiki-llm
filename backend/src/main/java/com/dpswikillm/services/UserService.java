package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.User;
import com.dpswikillm.repositories.UserRepository;
import jakarta.annotation.PostConstruct;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService implements UserDetailsService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties appProperties;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder, AppProperties appProperties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.appProperties = appProperties;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    @Transactional
    public User createUser(String username, String email, String rawPassword, List<String> roles) {
        String rolesStr = String.join(",", roles);
        User user = new User(username, email, passwordEncoder.encode(rawPassword), rolesStr);
        return userRepository.save(user);
    }

    @PostConstruct
    @Transactional
    public void seedAdmin() {
        String adminUsername = appProperties.admin().username();
        String adminPassword = appProperties.admin().password();
        if (adminUsername == null || adminUsername.isBlank()) {
            log.warn("ADMIN_USERNAME not set — skipping admin seeding. No admin account will exist.");
            return;
        }
        if (adminPassword == null || adminPassword.isBlank()) {
            log.warn("ADMIN_PASSWORD not set — skipping admin seeding.");
            return;
        }
        if (!userRepository.existsByUsername(adminUsername)) {
            createUser(adminUsername, adminUsername + "@local", adminPassword, List.of("ROLE_ADMIN", "ROLE_USER"));
            log.info("Admin user '{}' seeded.", adminUsername);
        }
    }
}
