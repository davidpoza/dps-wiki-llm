package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.dpswikillm.config.AppProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class WebDavClientTests {

    private WebDavClient client(String url) {
        AppProperties props = new AppProperties(
                "/vault", List.of("http://localhost:4200"),
                new AppProperties.Embeddings("http://embeddings:8080", "m", "", 384, Duration.ofSeconds(1)),
                new AppProperties.Llm("http://llm", "m", ""),
                new AppProperties.Telegram("", ""), null, null, null,
                new AppProperties.WebDav(url, "user", "pass"));
        return new WebDavClient(props);
    }

    @Test
    void disabledWhenUrlBlank() {
        WebDavClient client = client("");
        assertThat(client.isEnabled()).isFalse();
    }

    @Test
    void enabledWhenUrlPresent() {
        WebDavClient client = client("https://dav.example.com/vault");
        assertThat(client.isEnabled()).isTrue();
    }

    @Test
    void disabledModeReadsAreEmptyAndWritesAreNoops() throws Exception {
        WebDavClient client = client("");
        assertThat(client.get("note.md")).isEmpty();
        assertThat(client.list()).isEmpty();
        assertThatCode(() -> {
            client.put("note.md", "hello");
            client.delete("note.md");
            client.move("a.md", "b.md");
        }).doesNotThrowAnyException();
    }

    @Test
    void urlForMapsSimplePath() {
        WebDavClient client = client("https://dav.example.com/vault");
        assertThat(client.urlFor("note.md")).isEqualTo("https://dav.example.com/vault/note.md");
    }

    @Test
    void urlForStripsTrailingSlashOnBase() {
        WebDavClient client = client("https://dav.example.com/vault/");
        assertThat(client.urlFor("note.md")).isEqualTo("https://dav.example.com/vault/note.md");
    }

    @Test
    void urlForEncodesSpacesAndNestedDirs() {
        WebDavClient client = client("https://dav.example.com/vault");
        assertThat(client.urlFor("sub dir/a note.md"))
                .isEqualTo("https://dav.example.com/vault/sub%20dir/a%20note.md");
    }

    @Test
    void urlForEncodesNonAscii() {
        WebDavClient client = client("https://dav.example.com/vault");
        assertThat(client.urlFor("Ñoño/áéí.md"))
                .isEqualTo("https://dav.example.com/vault/%C3%91o%C3%B1o/%C3%A1%C3%A9%C3%AD.md");
    }

    @Test
    void encodeSegmentUsesPercent20ForSpaces() {
        assertThat(WebDavClient.encodeSegment("a b c")).isEqualTo("a%20b%20c");
    }
}
