package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.AppSetting;
import com.dpswikillm.repositories.AppSettingRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;

class ResourceSettingsServiceTests {

    @TempDir
    Path vault;

    @Test
    void updateSettingsStoresNormalizedRelativeFolder() {
        AppSettingRepository repository = Mockito.mock(AppSettingRepository.class);
        when(repository.findById("resource-folder")).thenReturn(Optional.empty());
        when(repository.save(any(AppSetting.class))).thenAnswer(inv -> inv.getArgument(0));
        ResourceSettingsService service = service(repository);

        assertThat(service.updateSettings("attachments\\images/").resourceFolder())
                .isEqualTo("attachments/images");
    }

    @Test
    void updateSettingsRejectsTraversalOutsideVault() {
        ResourceSettingsService service = service(Mockito.mock(AppSettingRepository.class));

        assertThatThrownBy(() -> service.updateSettings("../outside"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("escapes vault root");
    }

    @Test
    void resolveResourcePathAcceptsSupportedImages() {
        ResourceSettingsService service = service(Mockito.mock(AppSettingRepository.class));

        assertThat(service.resolveResourcePath("attachments/Pasted image 20260618163907.png"))
                .isEqualTo("attachments/Pasted image 20260618163907.png");
    }

    @Test
    void resolveResourcePathFindsBareFilenameInsideConfiguredFolder() throws Exception {
        Files.createDirectories(vault.resolve("resources/nested"));
        Files.writeString(vault.resolve("resources/nested/Pasted image 20260618163907.png"), "png");
        AppSettingRepository repository = Mockito.mock(AppSettingRepository.class);
        when(repository.findById("resource-folder"))
                .thenReturn(Optional.of(new AppSetting("resource-folder", "resources")));
        ResourceSettingsService service = service(repository);

        assertThat(service.resolveResourcePath("Pasted image 20260618163907.png"))
                .isEqualTo("resources/nested/Pasted image 20260618163907.png");
    }

    @Test
    void resolveResourcePathRejectsNonImages() {
        ResourceSettingsService service = service(Mockito.mock(AppSettingRepository.class));

        assertThatThrownBy(() -> service.resolveResourcePath("wiki/concepts/demo.md"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("supported image");
    }

    private ResourceSettingsService service(AppSettingRepository repository) {
        VaultPathResolver resolver = new VaultPathResolver(new AppProperties(
                vault.toString(),
                List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://localhost:11434/v1", "gpt-oss", "test"),
                new AppProperties.Telegram("", ""), null, null, null, null));
        return new ResourceSettingsService(repository, resolver);
    }
}
