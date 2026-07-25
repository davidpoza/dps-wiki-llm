package com.dpswikillm.services;

import com.dpswikillm.domain.GuardrailResult;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class MutationGuardrailService {
    private static final Logger log = LoggerFactory.getLogger(MutationGuardrailService.class);

    private static final Set<String> AMBIGUOUS_PLURALS =
            Set.of(
                    "analyses",
                    "theses",
                    "bases",
                    "crises",
                    "axes",
                    "indices",
                    "matrices",
                    "vertices",
                    "criteria",
                    "phenomena",
                    "data",
                    "media",
                    "alumni",
                    "cacti");

    private final VaultPathResolver pathResolver;

    public MutationGuardrailService(VaultPathResolver pathResolver) {
        this.pathResolver = pathResolver;
    }

    public GuardrailResult guardrail(MutationPlan plan, String rawPath, String sourceNotePath) {
        List<MutationAction> safe = new ArrayList<>();
        List<String> rejections = new ArrayList<>();
        for (MutationAction action :
                plan.pageActions() == null ? List.<MutationAction>of() : plan.pageActions()) {
            MutationAction normalized = normalizeConceptSlug(action);
            String rejection = rejectionReason(normalized, rawPath, sourceNotePath);
            if (rejection == null) {
                safe.add(normalized);
            } else {
                rejections.add(normalized.path() + ": " + rejection);
                safe.add(
                        MutationAction.merge(
                                MutationActionType.noop,
                                normalized.path(),
                                normalized.title(),
                                normalized.frontmatter(),
                                normalized.sections(),
                                normalized.idempotencyKey()));
            }
        }
        return new GuardrailResult(new MutationPlan(plan.planId(), safe), rejections);
    }

    private MutationAction normalizeConceptSlug(MutationAction action) {
        if (action == null || action.path() == null) {
            return action;
        }
        String path = action.path();
        if (!path.startsWith("wiki/concepts/") || !path.endsWith(".md")) {
            return action;
        }
        String filename = path.substring("wiki/concepts/".length(), path.length() - ".md".length());
        String singularized = singularizeSlug(filename);
        if (singularized == null) {
            log.warn(
                    "Concept slug '{}' appears to be an irregular plural — cannot auto-singularize; action will be rejected",
                    filename);
            return action;
        }
        if (!singularized.equals(filename)) {
            log.info("Concept slug normalized from '{}' to '{}'", filename, singularized);
            return MutationAction.merge(
                    action.action(),
                    "wiki/concepts/" + singularized + ".md",
                    action.title(),
                    action.frontmatter(),
                    action.sections(),
                    action.idempotencyKey());
        }
        return action;
    }

    private String singularizeSlug(String slug) {
        String[] parts = slug.split("-");
        String lastWord = parts[parts.length - 1];

        if (AMBIGUOUS_PLURALS.contains(lastWord)) {
            return null;
        }
        String singular;
        if (lastWord.endsWith("ies") && lastWord.length() > 3) {
            singular = lastWord.substring(0, lastWord.length() - 3) + "y";
        } else if (lastWord.endsWith("s") && !lastWord.endsWith("ss") && lastWord.length() > 3) {
            singular = lastWord.substring(0, lastWord.length() - 1);
        } else {
            return slug;
        }
        parts[parts.length - 1] = singular;
        return String.join("-", parts);
    }

    private String rejectionReason(MutationAction action, String rawPath, String sourceNotePath) {
        if (action == null || action.action() == null || action.path() == null) {
            return "invalid action";
        }
        String normalized;
        try {
            normalized = pathResolver.normalizeRelativePath(action.path());
        } catch (IllegalArgumentException ex) {
            return ex.getMessage();
        }
        if (!normalized.startsWith("wiki/")) {
            return "target must be under wiki/**";
        }
        if (action.action() == MutationActionType.create && normalized.startsWith("wiki/topics/")) {
            return "topic creation is forbidden";
        }
        // Reject if slug could not be singularized (ambiguous plural): the original path
        // still ends in an ambiguous plural word after normalizeConceptSlug returned it unchanged
        if (normalized.startsWith("wiki/concepts/") && normalized.endsWith(".md")) {
            String filename =
                    normalized.substring(
                            "wiki/concepts/".length(), normalized.length() - ".md".length());
            String[] parts = filename.split("-");
            String lastWord = parts[parts.length - 1];
            if (AMBIGUOUS_PLURALS.contains(lastWord)) {
                return "concept slug '"
                        + lastWord
                        + "' is an ambiguous plural — use the singular form manually";
            }
        }
        if (action.action() != MutationActionType.noop
                && (action.idempotencyKey() == null || action.idempotencyKey().isBlank())) {
            return "missing idempotency key";
        }
        if (requiresSourceBacklink(normalized) && !hasSourceBacklink(action, sourceNotePath)) {
            return "missing Sources backlink to " + sourceNotePath + " with raw ref " + rawPath;
        }
        return null;
    }

    private boolean requiresSourceBacklink(String path) {
        return path.startsWith("wiki/concepts/")
                || path.startsWith("wiki/entities/")
                || path.startsWith("wiki/topics/")
                || path.startsWith("wiki/analyses/");
    }

    private boolean hasSourceBacklink(MutationAction action, String sourceNotePath) {
        Map<String, List<String>> sections = action.sections();
        if (sections == null) {
            return false;
        }
        List<String> sources = sections.get("Sources");
        if (sources == null) {
            return false;
        }
        return sources.stream()
                .anyMatch(
                        item ->
                                item.contains(sourceNotePath)
                                        || item.contains("[[Source:")
                                        || item.contains("[["));
    }
}
