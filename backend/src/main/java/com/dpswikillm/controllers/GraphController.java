package com.dpswikillm.controllers;

import com.dpswikillm.dto.GraphResponseDto;
import com.dpswikillm.services.GraphService;
import java.io.IOException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/graph")
public class GraphController {

    private final GraphService graphService;

    public GraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    @GetMapping
    public GraphResponseDto getGraph() throws IOException {
        return graphService.buildGraph();
    }
}
