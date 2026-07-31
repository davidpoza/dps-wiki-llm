package com.dpswikillm.domain;

/**
 * A note that was loaded into the LLM context for a chat answer. Persisted as JSON alongside the
 * assistant {@link ChatMessage} so the UI can show which notes informed each answer and how they
 * were reached.
 *
 * @param path vault-relative path of the note
 * @param score similarity of the note to the user's query (cosine, 0..1)
 * @param provenance whether the note was a direct semantic hit or reached via link expansion
 * @param depth expansion depth at which the note was reached (0 for direct hits)
 */
public record ContextSource(String path, double score, Provenance provenance, int depth) {

    public enum Provenance {
        DIRECT,
        LINKED
    }

    public static ContextSource direct(String path, double score) {
        return new ContextSource(path, score, Provenance.DIRECT, 0);
    }

    public static ContextSource linked(String path, double score, int depth) {
        return new ContextSource(path, score, Provenance.LINKED, depth);
    }
}
