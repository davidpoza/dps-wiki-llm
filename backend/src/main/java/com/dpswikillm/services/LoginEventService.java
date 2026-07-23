package com.dpswikillm.services;

import com.dpswikillm.domain.LoginEvent;
import com.dpswikillm.domain.User;
import com.dpswikillm.dto.LoginEventDto;
import com.dpswikillm.repositories.LoginEventRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class LoginEventService {

    private final LoginEventRepository repository;
    private final GeoLocationService geoLocationService;

    public LoginEventService(
            LoginEventRepository repository, GeoLocationService geoLocationService) {
        this.repository = repository;
        this.geoLocationService = geoLocationService;
    }

    public void record(
            User user,
            String username,
            HttpServletRequest request,
            boolean success,
            String failureReason) {
        String ip = extractIp(request);
        GeoLocationService.GeoData geo = geoLocationService.resolve(ip);
        repository.save(
                new LoginEvent(
                        user, username, ip, geo.country(), geo.city(), success, failureReason));
    }

    public List<LoginEventDto> getHistory(User user) {
        return repository.findTop20ByUserOrderByCreatedAtDesc(user).stream()
                .map(
                        e ->
                                new LoginEventDto(
                                        e.getId(),
                                        e.getCreatedAt(),
                                        e.getIpAddress(),
                                        e.getCountry(),
                                        e.getCity(),
                                        e.isSuccess(),
                                        e.getFailureReason()))
                .toList();
    }

    private String extractIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
