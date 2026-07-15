package com.dpswikillm.services;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class GeoLocationService {

    private static final Logger log = LoggerFactory.getLogger(GeoLocationService.class);
    private static final String IP_API_URL = "http://ip-api.com/json/%s?fields=status,country,city";
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();

    public record GeoData(String country, String city) {}

    public GeoData resolve(String ipAddress) {
        if (ipAddress == null || isPrivateIp(ipAddress)) {
            return new GeoData("Local", "Local");
        }
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(String.format(IP_API_URL, ipAddress)))
                    .timeout(TIMEOUT)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return parseResponse(response.body());
        } catch (IOException | InterruptedException e) {
            log.warn("Geolocation lookup failed for {}: {}", ipAddress, e.getMessage());
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return new GeoData(null, null);
        }
    }

    private GeoData parseResponse(String body) {
        if (body == null || !body.contains("\"success\"")) {
            return new GeoData(null, null);
        }
        String country = extractField(body, "country");
        String city = extractField(body, "city");
        return new GeoData(country, city);
    }

    private String extractField(String json, String field) {
        Pattern p = Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]+)\"");
        Matcher m = p.matcher(json);
        return m.find() ? m.group(1) : null;
    }

    boolean isPrivateIp(String ipAddress) {
        try {
            InetAddress addr = InetAddress.getByName(ipAddress);
            return addr.isLoopbackAddress()
                    || addr.isSiteLocalAddress()
                    || addr.isLinkLocalAddress()
                    || ipAddress.startsWith("10.")
                    || ipAddress.startsWith("172.16.")
                    || ipAddress.startsWith("172.17.")
                    || ipAddress.startsWith("172.18.")
                    || ipAddress.startsWith("172.19.")
                    || ipAddress.startsWith("172.2")
                    || ipAddress.startsWith("172.3")
                    || ipAddress.startsWith("192.168.")
                    || ipAddress.equals("::1");
        } catch (Exception e) {
            return false;
        }
    }
}
