package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class JsonExtractionServiceTests {
    private final JsonExtractionService service = new JsonExtractionService(new ObjectMapper());

    @Test
    void extractsJsonObjectFromText() {
        var node = service.extractObject("Here is the plan: {\"summary\":\"ok\"}", json -> json.hasNonNull("summary"));

        assertThat(node.get("summary").asText()).isEqualTo("ok");
    }

    @Test
    void rejectsInvalidShape() {
        assertThatThrownBy(() -> service.extractObject("{\"summary\":\"\"}", json -> json.hasNonNull("missing")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("shape validation");
    }
}
