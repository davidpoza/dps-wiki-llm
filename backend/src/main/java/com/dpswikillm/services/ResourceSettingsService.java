package com.dpswikillm.services;

import com.dpswikillm.domain.AppSetting;
import com.dpswikillm.dto.ResourceSettingsDto;
import com.dpswikillm.repositories.AppSettingRepository;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ResourceSettingsService {

    private static final String RESOURCE_FOLDER_KEY = "resource-folder";
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "gif", "webp", "svg");

    private final AppSettingRepository repository;
    private final VaultPathResolver pathResolver;

    public ResourceSettingsService(AppSettingRepository repository, VaultPathResolver pathResolver) {
        this.repository = repository;
        this.pathResolver = pathResolver;
    }

    public ResourceSettingsDto getSettings() {
        return new ResourceSettingsDto(getResourceFolder());
    }

    public String getResourceFolder() {
        return repository.findById(RESOURCE_FOLDER_KEY)
                .map(AppSetting::getValue)
                .orElse("");
    }

    @Transactional
    public ResourceSettingsDto updateSettings(String resourceFolder) {
        String normalized = normalizeOptionalFolder(resourceFolder);
        AppSetting setting = repository.findById(RESOURCE_FOLDER_KEY)
                .orElseGet(() -> new AppSetting(RESOURCE_FOLDER_KEY, ""));
        setting.setValue(normalized);
        repository.save(setting);
        return new ResourceSettingsDto(normalized);
    }

    public String resolveResourcePath(String requestedPath) {
        String target = pathResolver.normalizeRelativePath(requestedPath);
        if (!isSupportedImage(target)) {
            throw new IllegalArgumentException("Resource is not a supported image");
        }
        return target;
    }

    private String normalizeOptionalFolder(String rawFolder) {
        if (rawFolder == null || rawFolder.isBlank()) {
            return "";
        }
        String normalized = pathResolver.normalizeRelativePath(rawFolder);
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private boolean isSupportedImage(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot == path.length() - 1) {
            return false;
        }
        return IMAGE_EXTENSIONS.contains(path.substring(dot + 1).toLowerCase());
    }
}
