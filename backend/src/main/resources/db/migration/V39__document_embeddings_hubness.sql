-- Per-document neighborhood-density statistic r_k (hubness) used by CSLS link-discovery
-- re-ranking. Nullable: populated after embedding and recomputed when the embedding changes.
-- Lives on document_embeddings so it is pruned automatically with its embedding row.
ALTER TABLE document_embeddings
    ADD COLUMN hubness DOUBLE PRECISION;
