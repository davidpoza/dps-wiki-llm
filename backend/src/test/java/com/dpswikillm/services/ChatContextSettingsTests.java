package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.domain.AppSetting;
import com.dpswikillm.dto.ChatContextSettingsDto;
import com.dpswikillm.repositories.AppSettingRepository;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ChatContextSettingsTests {

    private final Map<String, AppSetting> store = new HashMap<>();
    private ChatContextSettings settings;

    @BeforeEach
    void setUp() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        when(repo.findById(anyString()))
                .thenAnswer(inv -> Optional.ofNullable(store.get(inv.getArgument(0))));
        when(repo.save(any(AppSetting.class)))
                .thenAnswer(
                        inv -> {
                            AppSetting s = inv.getArgument(0);
                            store.put(s.getKey(), s);
                            return s;
                        });
        settings = new ChatContextSettings(repo);
    }

    @Test
    void returnsDefaultsWhenUnset() {
        ChatContextSettingsDto dto = settings.get();

        assertThat(dto)
                .isEqualTo(new ChatContextSettingsDto(5, false, 1, 5, 6_000));
    }

    @Test
    void persistsAndReadsBackUpdatedValues() {
        ChatContextSettingsDto saved =
                settings.update(new ChatContextSettingsDto(8, true, 2, 10, 8_000));

        assertThat(saved).isEqualTo(new ChatContextSettingsDto(8, true, 2, 10, 8_000));
        assertThat(settings.get()).isEqualTo(new ChatContextSettingsDto(8, true, 2, 10, 8_000));
    }

    @Test
    void rejectsOutOfRangeValuesWithoutPersisting() {
        assertThatThrownBy(
                        () -> settings.update(new ChatContextSettingsDto(0, false, 1, 5, 6_000)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () -> settings.update(new ChatContextSettingsDto(5, false, 9, 5, 6_000)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () -> settings.update(new ChatContextSettingsDto(5, false, 1, 5, 100)))
                .isInstanceOf(IllegalArgumentException.class);

        assertThat(store).isEmpty();
    }
}
