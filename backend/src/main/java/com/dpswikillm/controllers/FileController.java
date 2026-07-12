package com.dpswikillm.controllers;

import com.dpswikillm.dto.TreeNodeDto;
import com.dpswikillm.services.FileService;
import java.io.UncheckedIOException;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/files")
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @GetMapping("/tree")
    public List<TreeNodeDto> getTree() {
        return fileService.getTree();
    }

    @GetMapping(value = "/content", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> getContent(@RequestParam("path") String path) {
        try {
            return ResponseEntity.ok(fileService.getContent(path));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (UncheckedIOException e) {
            if (e.getCause().getMessage() != null && e.getCause().getMessage().contains("No such file")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.internalServerError().body(e.getCause().getMessage());
        }
    }

    @PutMapping(value = "/content", consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<Void> saveContent(@RequestParam("path") String path, @RequestBody String content) {
        try {
            fileService.saveContent(path, content);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (UncheckedIOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
