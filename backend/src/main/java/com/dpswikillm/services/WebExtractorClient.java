package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

/**
 * Thin HTTP client for the {@code web-extractor} microservice. Calls {@code POST /extract} and maps
 * typed service errors / transport failures to {@link WebExtractionException}.
 */
@Service
public class WebExtractorClient {

    /** Structured metadata returned alongside the markdown body. */
    public record ExtractionMetadata(
            String finalUrl,
            String canonicalUrl,
            String title,
            String author,
            String published,
            String siteName,
            String lang,
            String extractionConfidence) {}

    public record ExtractionResult(String markdown, ExtractionMetadata metadata) {}

    private record ExtractRequest(String url) {}

    private final RestClient restClient;

    public WebExtractorClient(RestClient.Builder builder, AppProperties properties) {
        AppProperties.Extractor cfg = properties.extractor();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        Duration timeout = cfg.timeout() == null ? Duration.ofSeconds(45) : cfg.timeout();
        factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        factory.setReadTimeout((int) timeout.toMillis());
        this.restClient = builder.baseUrl(cfg.baseUrl()).requestFactory(factory).build();
    }

    public ExtractionResult extractFile(MultipartFile file) {
        try {
            byte[] bytes = file.getBytes();
            String originalName =
                    file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload";
            ByteArrayResource resource =
                    new ByteArrayResource(bytes) {
                        @Override
                        public String getFilename() {
                            return originalName;
                        }
                    };
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", resource);
            return restClient
                    .post()
                    .uri("/extract/file")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .onStatus(
                            HttpStatusCode::isError,
                            (req, response) -> {
                                String code = "extraction_failed";
                                String message = "File extraction failed";
                                try {
                                    @SuppressWarnings("unchecked")
                                    Map<String, Object> errBody =
                                            new com.fasterxml.jackson.databind.ObjectMapper()
                                                    .readValue(response.getBody(), Map.class);
                                    if (errBody.get("error") != null)
                                        code = String.valueOf(errBody.get("error"));
                                    if (errBody.get("message") != null)
                                        message = String.valueOf(errBody.get("message"));
                                } catch (Exception ignored) {
                                }
                                throw new WebExtractionException(code, message);
                            })
                    .body(ExtractionResult.class);
        } catch (IOException ex) {
            throw new WebExtractionException(
                    "file_read_error", "Could not read uploaded file: " + ex.getMessage(), ex);
        } catch (ResourceAccessException ex) {
            throw new WebExtractionException(
                    "service_unavailable",
                    "Web extractor service is unreachable: " + ex.getMessage(),
                    ex);
        }
    }

    public ExtractionResult extract(String url) {
        try {
            return restClient
                    .post()
                    .uri("/extract")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new ExtractRequest(url))
                    .retrieve()
                    .onStatus(
                            HttpStatusCode::isError,
                            (request, response) -> {
                                String code = "extraction_failed";
                                String message = "Web extraction failed";
                                try {
                                    @SuppressWarnings("unchecked")
                                    Map<String, Object> body =
                                            new com.fasterxml.jackson.databind.ObjectMapper()
                                                    .readValue(response.getBody(), Map.class);
                                    if (body.get("error") != null)
                                        code = String.valueOf(body.get("error"));
                                    if (body.get("message") != null)
                                        message = String.valueOf(body.get("message"));
                                } catch (Exception ignored) {
                                    // fall back to defaults
                                }
                                throw new WebExtractionException(code, message);
                            })
                    .body(ExtractionResult.class);
        } catch (ResourceAccessException ex) {
            throw new WebExtractionException(
                    "service_unavailable",
                    "Web extractor service is unreachable: " + ex.getMessage(),
                    ex);
        }
    }
}
