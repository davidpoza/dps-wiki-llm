package com.dpswikillm.services;

import com.dpswikillm.domain.Job;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.Snapshot;
import com.dpswikillm.dto.ConceptDedupGroup;
import com.dpswikillm.dto.ConceptMergeRequest;
import com.dpswikillm.repositories.JobRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ConceptMergeJobHandler {
    private static final Logger log = LoggerFactory.getLogger(ConceptMergeJobHandler.class);

    private static final Pattern CODE_BLOCK = Pattern.compile("```[\\s\\S]*?```", Pattern.DOTALL);

    private final MarkdownService markdownService;
    private final VaultPathResolver pathResolver;
    private final SnapshotService snapshotService;
    private final ReindexService reindexService;
    private final EmbeddingIndexService embeddingIndexService;
    private final JobLifecycleService lifecycleService;
    private final JobRepository jobRepository;
    private final ObjectMapper objectMapper;

    public ConceptMergeJobHandler(
            MarkdownService markdownService,
            VaultPathResolver pathResolver,
            SnapshotService snapshotService,
            ReindexService reindexService,
            EmbeddingIndexService embeddingIndexService,
            JobLifecycleService lifecycleService,
            JobRepository jobRepository,
            ObjectMapper objectMapper) {
        this.markdownService = markdownService;
        this.pathResolver = pathResolver;
        this.snapshotService = snapshotService;
        this.reindexService = reindexService;
        this.embeddingIndexService = embeddingIndexService;
        this.lifecycleService = lifecycleService;
        this.jobRepository = jobRepository;
        this.objectMapper = objectMapper;
    }

    public void run(Job job) throws Exception {
        ConceptMergeRequest request =
                objectMapper.readValue(job.getPayloadRef(), ConceptMergeRequest.class);
        List<ConceptDedupGroup> groups = request.groups();
        log.info("Job {}: merging {} duplicate concept group(s)", job.getId(), groups.size());

        Snapshot snapshot =
                snapshotService.beginSnapshot(
                        job.getId().toString(),
                        "concept-merge",
                        "Merge " + groups.size() + " duplicate concept group(s)");
        PipelineTx tx = new PipelineTx();
        tx.onRollback("delete-snapshot", () -> snapshotService.deleteSnapshot(snapshot.getId()));

        try {
            lifecycleService.transition(
                    job.getId(), JobStatus.PROGRESS, "snapshot", "Capturing files before merge");

            List<String> allAffectedPaths = new ArrayList<>();

            for (ConceptDedupGroup group : groups) {
                String canonicalPath = "wiki/concepts/" + group.canonicalFilename() + ".md";
                List<String> secondaryPaths =
                        group.files().stream()
                                .filter(slug -> !slug.equals(group.canonicalFilename()))
                                .map(slug -> "wiki/concepts/" + slug + ".md")
                                .toList();

                snapshotService.captureFile(snapshot, canonicalPath);
                for (String secondary : secondaryPaths) {
                    snapshotService.captureFile(snapshot, secondary);
                }

                lifecycleService.transition(
                        job.getId(),
                        JobStatus.PROGRESS,
                        "merge",
                        "Merging group → " + group.canonicalFilename());

                mergeGroup(job, group.canonicalFilename(), secondaryPaths);

                snapshotService.recordAfter(snapshot, canonicalPath);
                for (String secondary : secondaryPaths) {
                    snapshotService.recordAfter(snapshot, secondary);
                }

                allAffectedPaths.add(canonicalPath);
                allAffectedPaths.addAll(secondaryPaths);

                lifecycleService.fileEvent(job, canonicalPath, "update");
                for (String secondary : secondaryPaths) {
                    lifecycleService.fileEvent(job, secondary, "delete");
                }
            }

            lifecycleService.transition(
                    job.getId(), JobStatus.PROGRESS, "backlinks", "Updating backlinks");
            updateBacklinksAcrossVault(groups, snapshot, job);

            lifecycleService.transition(
                    job.getId(), JobStatus.PROGRESS, "reindex", "Reindexing vault");
            reindexService.reindexWiki();
            embeddingIndexService.embedIncremental();

            snapshotService.finalizeSnapshot(snapshot, job);
            job.setAffectedPaths(objectMapper.writeValueAsString(allAffectedPaths));
            jobRepository.save(job);

            List<String> canonicals =
                    groups.stream().map(ConceptDedupGroup::canonicalFilename).toList();
            lifecycleService.transition(
                    job.getId(),
                    JobStatus.COMPLETED,
                    "completed",
                    "Merged " + groups.size() + " group(s) → " + canonicals);
            tx.clear();
        } catch (Exception ex) {
            tx.rollback();
            lifecycleService.transition(job.getId(), JobStatus.FAILED, "failed", ex.getMessage());
            throw ex;
        }
    }

    private void mergeGroup(Job job, String canonicalSlug, List<String> secondaryPaths)
            throws IOException {
        Path canonicalAbsPath = pathResolver.resolve("wiki/concepts/" + canonicalSlug + ".md");

        String canonicalContent =
                Files.exists(canonicalAbsPath)
                        ? Files.readString(canonicalAbsPath, StandardCharsets.UTF_8)
                        : "# " + canonicalSlug + "\n";

        MarkdownDocument canonicalDoc = markdownService.parse(canonicalContent);
        Map<String, String> mergedSections = new LinkedHashMap<>(canonicalDoc.sections());

        List<String> newAliases = new ArrayList<>();
        for (String secondaryPath : secondaryPaths) {
            Path secAbsPath = pathResolver.resolve(secondaryPath);
            if (!Files.exists(secAbsPath)) continue;
            String secContent = Files.readString(secAbsPath, StandardCharsets.UTF_8);
            MarkdownDocument secDoc = markdownService.parse(secContent);

            for (Map.Entry<String, String> entry : secDoc.sections().entrySet()) {
                mergedSections.putIfAbsent(entry.getKey(), entry.getValue());
            }

            String slug = slugFromPath(secondaryPath);
            if (!newAliases.contains(slug)) newAliases.add(slug);
        }

        Map<String, Object> frontmatterUpdates = buildAliasUpdate(canonicalDoc, newAliases);

        Map<String, List<String>> sectionUpdates = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : mergedSections.entrySet()) {
            if (!canonicalDoc.sections().containsKey(entry.getKey())) {
                sectionUpdates.put(entry.getKey(), List.of(entry.getValue()));
            }
        }

        String merged =
                markdownService.mergeAndRender(
                        canonicalContent,
                        canonicalSlug,
                        frontmatterUpdates.isEmpty() ? null : frontmatterUpdates,
                        sectionUpdates.isEmpty() ? null : sectionUpdates);

        Files.createDirectories(canonicalAbsPath.getParent());
        Files.writeString(canonicalAbsPath, merged, StandardCharsets.UTF_8);
        log.info("Merged content written to {}", canonicalSlug);

        for (String secondaryPath : secondaryPaths) {
            Path secAbsPath = pathResolver.resolve(secondaryPath);
            if (Files.exists(secAbsPath)) {
                Files.delete(secAbsPath);
                log.info("Deleted secondary concept file: {}", secondaryPath);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> buildAliasUpdate(MarkdownDocument doc, List<String> newAliases) {
        if (newAliases.isEmpty()) return Map.of();
        Object existing = doc.frontmatter().get("aliases");
        List<String> aliases =
                existing instanceof List<?> list
                        ? new ArrayList<>((List<String>) list)
                        : new ArrayList<>();
        for (String alias : newAliases) {
            if (!aliases.contains(alias)) aliases.add(alias);
        }
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("aliases", aliases);
        return updates;
    }

    private void updateBacklinksAcrossVault(
            List<ConceptDedupGroup> groups, Snapshot snapshot, Job job) throws IOException {
        Path vaultRoot = pathResolver.vaultRoot();
        if (!Files.exists(vaultRoot)) return;

        List<String[]> replacements = new ArrayList<>();
        for (ConceptDedupGroup group : groups) {
            for (String slug : group.files()) {
                if (!slug.equals(group.canonicalFilename())) {
                    replacements.add(new String[] {slug, group.canonicalFilename()});
                }
            }
        }
        if (replacements.isEmpty()) return;

        try (Stream<Path> walk = Files.walk(vaultRoot)) {
            List<Path> mdFiles =
                    walk.filter(p -> p.getFileName().toString().endsWith(".md")).toList();

            for (Path mdFile : mdFiles) {
                String rel = vaultRoot.relativize(mdFile).toString().replace('\\', '/');
                String content = Files.readString(mdFile, StandardCharsets.UTF_8);
                String updated = replaceWikilinks(content, replacements);
                if (!updated.equals(content)) {
                    snapshotService.captureFile(snapshot, rel);
                    Files.writeString(mdFile, updated, StandardCharsets.UTF_8);
                    snapshotService.recordAfter(snapshot, rel);
                    lifecycleService.fileEvent(job, rel, "update");
                    log.info("Updated backlinks in {}", rel);
                }
            }
        }
    }

    private String replaceWikilinks(String content, List<String[]> replacements) {
        List<int[]> codeRanges = findCodeBlockRanges(content);
        StringBuilder result = new StringBuilder(content);
        for (String[] replacement : replacements) {
            String from = replacement[0];
            String to = replacement[1];
            Pattern withAlias =
                    Pattern.compile("\\[\\[" + Pattern.quote(from) + "\\|([^\\]]+)\\]\\]");
            Pattern plain = Pattern.compile("\\[\\[" + Pattern.quote(from) + "\\]\\]");
            result =
                    new StringBuilder(
                            applyPattern(
                                    result.toString(),
                                    withAlias,
                                    m -> "[[" + to + "|" + m.group(1) + "]]",
                                    codeRanges));
            result =
                    new StringBuilder(
                            applyPattern(
                                    result.toString(), plain, m -> "[[" + to + "]]", codeRanges));
        }
        return result.toString();
    }

    private String applyPattern(
            String content,
            Pattern pattern,
            java.util.function.Function<Matcher, String> replacement,
            List<int[]> codeRanges) {
        Matcher m = pattern.matcher(content);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            if (inCodeRange(m.start(), codeRanges)) {
                m.appendReplacement(sb, Matcher.quoteReplacement(m.group()));
            } else {
                m.appendReplacement(sb, Matcher.quoteReplacement(replacement.apply(m)));
            }
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private List<int[]> findCodeBlockRanges(String content) {
        List<int[]> ranges = new ArrayList<>();
        Matcher m = CODE_BLOCK.matcher(content);
        while (m.find()) {
            ranges.add(new int[] {m.start(), m.end()});
        }
        return ranges;
    }

    private boolean inCodeRange(int pos, List<int[]> ranges) {
        for (int[] range : ranges) {
            if (pos >= range[0] && pos < range[1]) return true;
        }
        return false;
    }

    private String slugFromPath(String path) {
        String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        if (filename.endsWith(".md")) filename = filename.substring(0, filename.length() - 3);
        return filename;
    }
}
