package com.dpswikillm.services;

import com.dpswikillm.domain.MutationAction;
import com.dpswikillm.domain.MutationActionType;
import com.dpswikillm.domain.MutationPlan;
import com.dpswikillm.domain.MutationResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class MutationApplier {
    private static final String IDEMPOTENCY_LEDGER = "state/runtime/idempotency-keys.json";

    private final VaultPathResolver pathResolver;
    private final MarkdownService markdownService;
    private final ObjectMapper objectMapper;

    public MutationApplier(
            VaultPathResolver pathResolver,
            MarkdownService markdownService,
            ObjectMapper objectMapper) {
        this.pathResolver = pathResolver;
        this.markdownService = markdownService;
        this.objectMapper = objectMapper;
    }

    public MutationResult apply(MutationPlan plan) throws IOException {
        MutationResult result = MutationResult.empty(plan.planId());
        Path ledgerPath = pathResolver.resolve(IDEMPOTENCY_LEDGER);
        Files.createDirectories(ledgerPath.getParent());
        Map<String, LedgerRecord> ledger = loadLedger(ledgerPath);

        for (MutationAction action : plan.pageActions()) {
            applyAction(plan, action, ledger, result);
        }
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(ledgerPath.toFile(), ledger);
        return result;
    }

    private void applyAction(
            MutationPlan plan,
            MutationAction action,
            Map<String, LedgerRecord> ledger,
            MutationResult result)
            throws IOException {
        if (action.action() == MutationActionType.noop) {
            result.skipped().add(action.path());
            return;
        }
        String relativePath = pathResolver.normalizeRelativePath(action.path());
        if (action.action() == MutationActionType.create
                && relativePath.startsWith("wiki/topics/")) {
            throw new IllegalArgumentException("Refusing to auto-create topic: " + relativePath);
        }

        if (action.idempotencyKey() != null && ledger.containsKey(action.idempotencyKey())) {
            LedgerRecord record = ledger.get(action.idempotencyKey());
            if (!record.path().equals(relativePath)) {
                throw new IllegalArgumentException(
                        "Idempotency key collision for " + action.idempotencyKey());
            }
            result.idempotentHits().add(action.idempotencyKey());
            return;
        }

        Path absolutePath = pathResolver.resolve(relativePath);
        boolean exists = Files.exists(absolutePath);
        if (action.action() == MutationActionType.update && !exists) {
            throw new IllegalArgumentException("Cannot update missing note: " + relativePath);
        }
        Files.createDirectories(absolutePath.getParent());

        String existing = exists ? Files.readString(absolutePath, StandardCharsets.UTF_8) : "";
        String rendered =
                markdownService.mergeAndRender(
                        existing, action.title(), action.frontmatter(), action.sections());
        Files.writeString(absolutePath, rendered, StandardCharsets.UTF_8);

        if (exists) {
            result.updated().add(relativePath);
        } else {
            result.created().add(relativePath);
        }
        if (action.idempotencyKey() != null && !action.idempotencyKey().isBlank()) {
            ledger.put(
                    action.idempotencyKey(),
                    new LedgerRecord(relativePath, plan.planId(), Instant.now().toString()));
        }
    }

    private Map<String, LedgerRecord> loadLedger(Path ledgerPath) throws IOException {
        if (!Files.exists(ledgerPath)) {
            return new LinkedHashMap<>();
        }
        return objectMapper.readValue(ledgerPath.toFile(), new TypeReference<>() {});
    }

    public record LedgerRecord(String path, String planId, String appliedAt) {}
}
