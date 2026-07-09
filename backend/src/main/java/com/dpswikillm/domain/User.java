package com.dpswikillm.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

@Entity
@Table(name = "users")
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id = UUID.randomUUID();

    @Column(nullable = false, unique = true, length = 80)
    private String username;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String roles = "ROLE_USER";

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    protected User() {}

    public User(String username, String email, String passwordHash, String roles) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
        this.roles = roles;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Arrays.stream(roles.split(","))
                .map(String::trim)
                .filter(r -> !r.isBlank())
                .map(SimpleGrantedAuthority::new)
                .toList();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getRoles() { return roles; }
    public List<String> getRoleList() { return Arrays.asList(roles.split(",")); }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    @PreUpdate
    void onUpdate() { this.updatedAt = OffsetDateTime.now(); }
}
