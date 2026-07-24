package com.dpswikillm.dto;

import java.util.List;

public record GraphResponseDto(List<GraphNodeDto> nodes, List<GraphEdgeDto> edges) {}
