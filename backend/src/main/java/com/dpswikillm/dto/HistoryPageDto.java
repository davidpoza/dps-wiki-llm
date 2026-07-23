package com.dpswikillm.dto;

import java.util.List;

public record HistoryPageDto(
        List<FileHistoryEntryDto> content, long totalElements, int page, int size) {}
