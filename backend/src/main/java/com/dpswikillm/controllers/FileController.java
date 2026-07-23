package com.dpswikillm.controllers;

import com.dpswikillm.dto.FileVersionDto;
import com.dpswikillm.dto.TreeNodeDto;
import com.dpswikillm.services.FileService;
import com.dpswikillm.services.ResourceSettingsService;
import com.dpswikillm.services.SnapshotService;
import com.dpswikillm.services.WebDavReplicationException;
import java.io.UncheckedIOException;
import java.net.URLConnection;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
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
    private final SnapshotService snapshotService;
    private final ResourceSettingsService resourceSettingsService;

    public FileController(
            FileService fileService,
            SnapshotService snapshotService,
            ResourceSettingsService resourceSettingsService) {
        this.fileService = fileService;
        this.snapshotService = snapshotService;
        this.resourceSettingsService = resourceSettingsService;
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
            if (e.getCause().getMessage() != null
                    && e.getCause().getMessage().contains("No such file")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.internalServerError().body(e.getCause().getMessage());
        }
    }

    @GetMapping("/resource")
    public ResponseEntity<byte[]> getResource(@RequestParam("path") String path) {
        try {
            String resourcePath = resourceSettingsService.resolveResourcePath(path);
            byte[] content = fileService.getBinaryContent(resourcePath);
            String mediaType = URLConnection.guessContentTypeFromName(resourcePath);
            if (mediaType == null || !mediaType.startsWith("image/")) {
                mediaType = "application/octet-stream";
            }
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(mediaType))
                    .body(content);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping(value = "/content", consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<?> saveContent(
            @RequestParam("path") String path, @RequestBody String content) {
        try {
            fileService.saveContent(path, content);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (WebDavReplicationException e) {
            // Saved locally + recorded in history, but not replicated to WebDAV.
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("saved", true, "replicated", false, "error", "not_replicated"));
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/content")
    public ResponseEntity<?> deleteContent(@RequestParam("path") String path) {
        try {
            fileService.deleteFile(path);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (WebDavReplicationException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("saved", true, "replicated", false, "error", "not_replicated"));
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/rename")
    public ResponseEntity<?> renameContent(
            @RequestParam("path") String path, @RequestParam("newName") String newName) {
        try {
            fileService.renameFile(path, newName);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (FileService.FileAlreadyExistsException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (WebDavReplicationException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("saved", true, "replicated", false, "error", "not_replicated"));
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
    public ResponseEntity<?> moveContent(
            @RequestParam("path") String path, @RequestParam("targetDir") String targetDir) {
        try {
            fileService.moveFile(path, targetDir);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (FileService.FileAlreadyExistsException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (WebDavReplicationException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("saved", true, "replicated", false, "error", "not_replicated"));
        } catch (UncheckedIOException | IllegalStateException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/versions")
    public ResponseEntity<List<FileVersionDto>> getVersions(@RequestParam("path") String path) {
        try {
            return ResponseEntity.ok(snapshotService.getVersions(path));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping(value = "/version", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> getVersion(
            @RequestParam("path") String path, @RequestParam("versionId") UUID versionId) {
        try {
            return ResponseEntity.ok(snapshotService.getVersionContent(path, versionId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping(value = "/pdf", produces = "application/pdf")
    public ResponseEntity<byte[]> exportPdf(@RequestParam("path") String path) {
        try {
            byte[] pdf = fileService.exportPdf(path);
            String filename = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
            if (filename.endsWith(".md")) filename = filename.substring(0, filename.length() - 3);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentDisposition(
                    ContentDisposition.attachment().filename(filename + ".pdf").build());
            return ResponseEntity.ok().headers(headers).body(pdf);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FileService.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (FileService.PdfExportException | UncheckedIOException | IllegalStateException e) {
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
