package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.dpswikillm.domain.LoginEvent;
import com.dpswikillm.domain.User;
import com.dpswikillm.dto.LoginEventDto;
import com.dpswikillm.repositories.LoginEventRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LoginEventServiceTests {

    @Mock private LoginEventRepository repository;
    @Mock private GeoLocationService geoLocationService;

    private LoginEventService service() {
        return new LoginEventService(repository, geoLocationService);
    }

    @Test
    void getHistory_scopesStrictlyToCallerUsername() {
        User alice = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        when(repository.findTop20ByUsernameOrderByCreatedAtDesc("alice")).thenReturn(List.of());

        service().getHistory(alice);

        // The history is looked up by the caller's own username, which is how another account's
        // events are kept out of the result.
        verify(repository).findTop20ByUsernameOrderByCreatedAtDesc("alice");
        verifyNoMoreInteractions(repository);
    }

    @Test
    void getHistory_includesFailedAttemptWithNullUser() {
        User alice = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        // A wrong-password attempt is recorded with no linked user (user == null) but with the
        // attempted username, exactly as AuthController does for BAD_CREDENTIALS.
        LoginEvent failed =
                new LoginEvent(null, "alice", "1.2.3.4", "ES", "Madrid", false, "BAD_CREDENTIALS");
        when(repository.findTop20ByUsernameOrderByCreatedAtDesc("alice"))
                .thenReturn(List.of(failed));

        List<LoginEventDto> history = service().getHistory(alice);

        assertThat(history).hasSize(1);
        LoginEventDto dto = history.get(0);
        assertThat(dto.success()).isFalse();
        assertThat(dto.failureReason()).isEqualTo("BAD_CREDENTIALS");
        assertThat(dto.ipAddress()).isEqualTo("1.2.3.4");
        assertThat(dto.country()).isEqualTo("ES");
        assertThat(dto.city()).isEqualTo("Madrid");
    }

    @Test
    void getHistory_returnsEmptyWhenNoEvents() {
        User alice = new User("alice", "alice@test.com", "$2a$hash", "ROLE_USER");
        when(repository.findTop20ByUsernameOrderByCreatedAtDesc("alice")).thenReturn(List.of());

        assertThat(service().getHistory(alice)).isEmpty();
    }
}
