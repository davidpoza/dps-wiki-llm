package com.dpswikillm.dto;

/**
 * Configuration governing how the interactive chat builds its knowledge-base context.
 *
 * @param topK number of semantic hits retrieved for a message
 * @param expansionEnabled whether to expand context by following {@code [[wikilinks]]}
 * @param maxDepth maximum link-expansion depth (0 = direct hits only)
 * @param maxLinkedNotes maximum number of linked notes added on top of the direct hits
 * @param contextBudgetChars maximum size (characters) of the assembled KB context packet
 */
public record ChatContextSettingsDto(
        int topK,
        boolean expansionEnabled,
        int maxDepth,
        int maxLinkedNotes,
        int contextBudgetChars) {}
