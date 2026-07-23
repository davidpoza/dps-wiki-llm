package com.dpswikillm.services;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.dto.JobEvent;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestTemplate;
import org.telegram.telegrambots.longpolling.util.LongPollingSingleThreadUpdateConsumer;
import org.telegram.telegrambots.meta.api.objects.Update;

public class WikiBotService implements LongPollingSingleThreadUpdateConsumer {
    private static final Logger log = LoggerFactory.getLogger(WikiBotService.class);

    private final String token;
    private final String allowedChatId;
    private final JobQueueService queueService;
    private final JobEventService eventService;
    private final RawIntakeService rawIntakeService;
    private final RestTemplate restTemplate;

    private final Map<UUID, Long> pendingJobs = new ConcurrentHashMap<>();

    public WikiBotService(
            AppProperties props,
            JobQueueService queueService,
            JobEventService eventService,
            RawIntakeService rawIntakeService,
            RestTemplate restTemplate) {
        this.token = props.telegram().token();
        this.allowedChatId = props.telegram().allowedChatId();
        this.queueService = queueService;
        this.eventService = eventService;
        this.rawIntakeService = rawIntakeService;
        this.restTemplate = restTemplate;
    }

    @Override
    public void consume(Update update) {
        if (!update.hasMessage() || !update.getMessage().hasText()) {
            return;
        }
        long chatId = update.getMessage().getChatId();
        if (!String.valueOf(chatId).equals(allowedChatId)) {
            log.debug("Ignoring update from unauthorized chat {}", chatId);
            return;
        }
        String text = update.getMessage().getText().trim();
        try {
            if (text.startsWith("/ingest ")) {
                String url = text.substring("/ingest ".length()).trim();
                handleIngest(chatId, url);
            } else {
                String question =
                        text.startsWith("/ask ") ? text.substring("/ask ".length()).trim() : text;
                handleAsk(chatId, question);
            }
        } catch (Exception ex) {
            log.error("Error handling Telegram update", ex);
            sendText(chatId, "Error: " + ex.getMessage());
        }
    }

    private void handleAsk(long chatId, String question) {
        if (question.isBlank()) {
            sendText(chatId, "Please provide a question after /ask.");
            return;
        }
        EnqueueJobResponse response =
                queueService.enqueue(JobType.ANSWER, JobMode.unattended, question);
        pendingJobs.put(response.jobId(), chatId);
        eventService.registerTerminalListener(
                response.jobId(), event -> onJobTerminal(event, chatId));
        sendText(
                chatId,
                "Answer job enqueued (position "
                        + response.queuePosition()
                        + "). I'll reply when ready.");
    }

    private void handleIngest(long chatId, String url) throws IOException {
        if (url.isBlank()) {
            sendText(chatId, "Please provide a URL after /ingest.");
            return;
        }
        String payloadRef = rawIntakeService.ingestUrl(url);
        EnqueueJobResponse response =
                queueService.enqueue(JobType.INGEST, JobMode.unattended, payloadRef);
        pendingJobs.put(response.jobId(), chatId);
        eventService.registerTerminalListener(
                response.jobId(), event -> onJobTerminal(event, chatId));
        sendText(
                chatId,
                "Ingest job enqueued (position "
                        + response.queuePosition()
                        + "). I'll reply when done.");
    }

    private void onJobTerminal(JobEvent event, long chatId) {
        pendingJobs.remove(event.jobId());
        if (event.type() == JobStatus.COMPLETED) {
            String result = event.result() != null ? event.result() : "{}";
            sendText(chatId, "Job completed.\n" + result);
        } else if (event.type() == JobStatus.FAILED) {
            sendText(chatId, "Job failed: " + event.message());
        } else {
            sendText(chatId, "Job finished with status: " + event.type());
        }
    }

    void sendText(long chatId, String text) {
        try {
            String url = "https://api.telegram.org/bot" + token + "/sendMessage";
            restTemplate.postForEntity(
                    url, Map.of("chat_id", String.valueOf(chatId), "text", text), Map.class);
        } catch (Exception ex) {
            log.error("Failed to send Telegram message to chat {}", chatId, ex);
        }
    }

    Consumer<JobEvent> terminalListenerFor(UUID jobId) {
        return event -> onJobTerminal(event, pendingJobs.getOrDefault(jobId, 0L));
    }
}
