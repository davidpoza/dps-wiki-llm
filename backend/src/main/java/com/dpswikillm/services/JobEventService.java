package com.dpswikillm.services;

import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.dto.JobEvent;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class JobEventService {
    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
    private final Map<UUID, Consumer<JobEvent>> terminalListeners = new ConcurrentHashMap<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        return emitter;
    }

    public void registerTerminalListener(UUID jobId, Consumer<JobEvent> listener) {
        terminalListeners.put(jobId, listener);
    }

    public void broadcast(JobEvent event) {
        for (SseEmitter emitter : Set.copyOf(emitters)) {
            try {
                emitter.send(SseEmitter.event().name(event.type().name()).data(event));
            } catch (IOException | IllegalStateException ex) {
                emitters.remove(emitter);
            }
        }
        if (isTerminal(event.type()) && event.jobId() != null) {
            Consumer<JobEvent> listener = terminalListeners.remove(event.jobId());
            if (listener != null) {
                listener.accept(event);
            }
        }
    }

    private boolean isTerminal(JobStatus status) {
        return status == JobStatus.COMPLETED || status == JobStatus.FAILED || status == JobStatus.REVERTED;
    }

    int subscriberCount() {
        return emitters.size();
    }
}
