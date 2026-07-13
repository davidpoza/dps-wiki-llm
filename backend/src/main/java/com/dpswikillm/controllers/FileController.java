package com.dpswikillm.controllers;

import com.dpswikillm.dto.TreeNodeDto;
import com.dpswikillm.services.FileService;
import java.io.UncheckedIOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/content")
    public ResponseEntity<Void> deleteContent(@RequestParam("path") String path) {
        try {
            fileService.deleteFile(path);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/rename")
    public ResponseEntity<Void> renameContent(
            @RequestParam("path") String path,
            @RequestParam("newName") String newName) {
        try {
            fileService.renameFile(path, newName);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (FileService.FileAlreadyExistsException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/directory")
    public ResponseEntity<Void> createDirectory(@RequestParam("path") String path) {
        try {
            fileService.createDirectory(path);
            return ResponseEntity.status(HttpStatus.CREATED).build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.FileAlreadyExistsException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/move")
    public ResponseEntity<Void> moveContent(
            @RequestParam("path") String path,
            @RequestParam("targetDir") String targetDir) {
        try {
            fileService.moveFile(path, targetDir);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (FileService.FileAlreadyExistsException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/content")
    public ResponseEntity<Void> createContent(@RequestParam("path") String path) {
        try {
            fileService.createFile(path);
            return ResponseEntity.status(HttpStatus.CREATED).build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.FileAlreadyExistsException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
