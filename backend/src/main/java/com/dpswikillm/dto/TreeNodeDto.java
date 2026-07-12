package com.dpswikillm.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TreeNodeDto(
        String key,
        String label,
        String data,
        String icon,
        boolean leaf,
        List<TreeNodeDto> children
) {}
