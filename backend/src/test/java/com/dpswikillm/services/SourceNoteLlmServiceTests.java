package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dpswikillm.domain.LlmSourceNote;
import com.dpswikillm.domain.NormalizedSourcePayload;
import com.dpswikillm.domain.SourceKind;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SourceNoteLlmServiceTests {

    private SourceNoteLlmService serviceReturning(String llmResponse) {
        LlmClient llmClient = mock(LlmClient.class);
        when(llmClient.chatJson(anyList())).thenReturn(llmResponse);
        PromptService promptService = mock(PromptService.class);
        when(promptService.getText("source-note-system")).thenReturn("system prompt");
        return new SourceNoteLlmService(
                llmClient, new JsonExtractionService(new ObjectMapper()), promptService, new RetryingLlmExecutor());
    }

    private NormalizedSourcePayload payload() {
        return new NormalizedSourcePayload(
                "src-1", SourceKind.web, Instant.EPOCH, "raw/web/src-1.json",
                "Title", "some source content", "https://example.com", "checksum", Map.of(), null);
    }

    @Test
    void normalizesKeywordsToLowercaseKebabCaseDedupedAndOrdered() {
        // Mixed case, spaces, a post-normalization duplicate, and a blank entry.
        SourceNoteLlmService service = serviceReturning("""
                {"summary": "resumen", "raw_context": "contexto", \
                "extracted_claims": ["afirmacion"], "open_questions": ["pregunta"], \
                "keywords": ["Machine Learning", "Bile Acid", "  ", "machine learning", "gut-health"]}""");

        LlmSourceNote note = service.clean(payload());

        // Lowercase kebab-case; "machine learning" collapses onto "Machine Learning"; blank dropped; order preserved.
        assertThat(note.keywords())
                .containsExactly("machine-learning", "bile-acid", "gut-health");
    }

    @Test
    void keepsNoteBodyFieldsFromLlmResponse() {
        SourceNoteLlmService service = serviceReturning("""
                {"summary": "resumen en espanol", "raw_context": "contexto completo", \
                "extracted_claims": ["afirmacion uno"], "open_questions": ["pregunta uno"], \
                "keywords": ["one-keyword", "two-keyword", "three-keyword"]}""");

        LlmSourceNote note = service.clean(payload());

        assertThat(note.summary()).isEqualTo("resumen en espanol");
        assertThat(note.rawContext()).isEqualTo("contexto completo");
        assertThat(note.extractedClaims()).containsExactly("afirmacion uno");
        assertThat(note.openQuestions()).containsExactly("pregunta uno");
        assertThat(note.generatedBy()).isEqualTo("llm");
    }
}
