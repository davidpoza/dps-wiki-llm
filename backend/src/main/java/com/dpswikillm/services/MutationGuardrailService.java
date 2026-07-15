package com.dpswikillm.services;

import com.dpswikillm.domain.GuardrailResult;
import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class MutationGuardrailService {
    private final VaultPathResolver pathResolver;

    public MutationGuardrailService(VaultPathResolver pathResolver) {
        this.pathResolver = pathResolver;
    }

    public GuardrailResult guardrail(MutationPlan plan, String rawPath, String sourceNotePath) {
        List<MutationAction> safe = new ArrayList<>();
        List<String> rejections = new ArrayList<>();
        for (MutationAction action : plan.pageActions() == null ? List.<MutationAction>of() : plan.pageActions()) {
            String rejection = rejectionReason(action, rawPath, sourceNotePath);
            if (rejection == null) {
                safe.add(action);
            } else {
                rejections.add(action.path() + ": " + rejection);
                safe.add(new MutationAction(MutationActionType.noop, action.path(), action.title(),
                        action.frontmatter(), action.sections(), action.idempotencyKey()));
            }
        }
        return new GuardrailResult(new MutationPlan(plan.planId(), safe), rejections);
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
        return sources.stream().anyMatch(item -> item.contains(sourceNotePath) || item.contains("[[Source:") || item.contains("[["));
    }
}
