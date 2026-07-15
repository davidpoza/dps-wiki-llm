package com.dpswikillm.dto;

import java.util.List;

public record CommitDto(String sha, String author, String date, String message, List<CommitFileStatDto> files) {}
