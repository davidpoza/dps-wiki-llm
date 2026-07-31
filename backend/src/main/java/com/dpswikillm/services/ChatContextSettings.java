package com.dpswikillm.services;

import com.dpswikillm.domain.AppSetting;
import com.dpswikillm.dto.ChatContextSettingsDto;
import com.dpswikillm.repositories.AppSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persisted, hot-reloadable configuration for the interactive chat context pipeline. Values are
 * stored as {@code chat.*} {@link AppSetting} key-value rows and read fresh on each request, so
 * changes take effect on the next message without a restart. Defaults reproduce the historical
 * behavior (top-K = 5, expansion off, 6000-char budget).
 */
@Service
public class ChatContextSettings {

    static final String TOP_K_KEY = "chat.top-k";
    static final String EXPANSION_ENABLED_KEY = "chat.expansion-enabled";
    static final String MAX_DEPTH_KEY = "chat.max-depth";
    static final String MAX_LINKED_NOTES_KEY = "chat.max-linked-notes";
    static final String CONTEXT_BUDGET_CHARS_KEY = "chat.context-budget-chars";

    static final int TOP_K_DEFAULT = 5;
    static final boolean EXPANSION_ENABLED_DEFAULT = false;
    static final int MAX_DEPTH_DEFAULT = 1;
    static final int MAX_LINKED_NOTES_DEFAULT = 5;
    static final int CONTEXT_BUDGET_CHARS_DEFAULT = 6_000;

    static final int TOP_K_MIN = 1;
    static final int TOP_K_MAX = 20;
    static final int MAX_DEPTH_MIN = 0;
    static final int MAX_DEPTH_MAX = 3;
    static final int MAX_LINKED_NOTES_MIN = 0;
    static final int MAX_LINKED_NOTES_MAX = 50;
    static final int CONTEXT_BUDGET_CHARS_MIN = 500;
    static final int CONTEXT_BUDGET_CHARS_MAX = 50_000;

    private final AppSettingRepository repository;

    public ChatContextSettings(AppSettingRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public ChatContextSettingsDto get() {
        return new ChatContextSettingsDto(
                readInt(TOP_K_KEY, TOP_K_DEFAULT),
                readBoolean(EXPANSION_ENABLED_KEY, EXPANSION_ENABLED_DEFAULT),
                readInt(MAX_DEPTH_KEY, MAX_DEPTH_DEFAULT),
                readInt(MAX_LINKED_NOTES_KEY, MAX_LINKED_NOTES_DEFAULT),
                readInt(CONTEXT_BUDGET_CHARS_KEY, CONTEXT_BUDGET_CHARS_DEFAULT));
    }

    @Transactional
    public ChatContextSettingsDto update(ChatContextSettingsDto request) {
        validate(request);
        save(TOP_K_KEY, String.valueOf(request.topK()));
        save(EXPANSION_ENABLED_KEY, String.valueOf(request.expansionEnabled()));
        save(MAX_DEPTH_KEY, String.valueOf(request.maxDepth()));
        save(MAX_LINKED_NOTES_KEY, String.valueOf(request.maxLinkedNotes()));
        save(CONTEXT_BUDGET_CHARS_KEY, String.valueOf(request.contextBudgetChars()));
        return get();
    }

    private void validate(ChatContextSettingsDto r) {
        requireRange("topK", r.topK(), TOP_K_MIN, TOP_K_MAX);
        requireRange("maxDepth", r.maxDepth(), MAX_DEPTH_MIN, MAX_DEPTH_MAX);
        requireRange("maxLinkedNotes", r.maxLinkedNotes(), MAX_LINKED_NOTES_MIN, MAX_LINKED_NOTES_MAX);
        requireRange(
                "contextBudgetChars",
                r.contextBudgetChars(),
                CONTEXT_BUDGET_CHARS_MIN,
                CONTEXT_BUDGET_CHARS_MAX);
    }

    private static void requireRange(String field, int value, int min, int max) {
        if (value < min || value > max) {
            throw new IllegalArgumentException(
                    field + " must be between " + min + " and " + max + " (was " + value + ")");
        }
    }

    private int readInt(String key, int fallback) {
        return repository
                .findById(key)
                .map(
                        s -> {
                            try {
                                return Integer.parseInt(s.getValue().trim());
                            } catch (NumberFormatException ignored) {
                                return fallback;
                            }
                        })
                .orElse(fallback);
    }

    private boolean readBoolean(String key, boolean fallback) {
        return repository
                .findById(key)
                .map(s -> Boolean.parseBoolean(s.getValue().trim()))
                .orElse(fallback);
    }

    private void save(String key, String value) {
        AppSetting setting = repository.findById(key).orElse(new AppSetting(key, value));
        setting.setValue(value);
        repository.save(setting);
    }
}
