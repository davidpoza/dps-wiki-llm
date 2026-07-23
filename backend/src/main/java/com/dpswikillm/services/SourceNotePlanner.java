package com.dpswikillm.services;

import com.dpswikillm.domain.LlmSourceNote;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.NormalizedSourcePayload;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class SourceNotePlanner {
    public MutationPlan baselinePlan(NormalizedSourcePayload payload) {
        String path = sourceNotePath(payload);
        LlmSourceNote note = payload.sourceNote();
        Map<String, Object> frontmatter = new LinkedHashMap<>();
        frontmatter.put("type", "source");
        frontmatter.put("title", payload.title());
        frontmatter.put("source_kind", payload.sourceKind().name());
        frontmatter.put("source_ref", payload.rawPath());
        frontmatter.put("source_id", payload.sourceId());
        frontmatter.put("captured_at", payload.capturedAt().toString());
        frontmatter.put(
                "updated", payload.capturedAt().atZone(ZoneOffset.UTC).toLocalDate().toString());
        frontmatter.put("checksum", payload.checksum());
        if (payload.canonicalUrl() != null) {
            frontmatter.put("canonical_url", payload.canonicalUrl());
        }

        if (note.keywords() != null && !note.keywords().isEmpty()) {
            frontmatter.put("keywords", note.keywords());
        }

        Map<String, List<String>> sections = new LinkedHashMap<>();
        sections.put("Summary", List.of(note.summary()));
        sections.put("Raw Context", List.of(note.rawContext()));
        if (note.extractedClaims() != null && !note.extractedClaims().isEmpty()) {
            sections.put("Extracted Claims", note.extractedClaims());
        }
        if (note.openQuestions() != null && !note.openQuestions().isEmpty()) {
            sections.put("Open Questions", note.openQuestions());
        }

        return new MutationPlan(
                "ingest-" + payload.sourceId().replace(":", "-"),
                List.of(
                        new MutationAction(
                                MutationActionType.create,
                                path,
                                payload.title(),
                                frontmatter,
                                sections,
                                payload.sourceId())));
    }

    public String sourceNotePath(NormalizedSourcePayload payload) {
        String date = payload.capturedAt().atZone(ZoneOffset.UTC).toLocalDate().toString();
        String slug = TextUtil.slugify(payload.title(), payload.sourceId().replace(":", "-"));
        return "wiki/sources/" + date + "-" + slug + ".md";
    }

    public String planTimestamp(NormalizedSourcePayload payload) {
        return DateTimeFormatter.ISO_INSTANT.format(payload.capturedAt()).replace(":", "-");
    }
}
