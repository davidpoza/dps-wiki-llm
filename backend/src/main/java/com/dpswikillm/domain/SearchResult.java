package com.dpswikillm.domain;

public record SearchResult(String path, String title, String docType, double score, String body) {}
