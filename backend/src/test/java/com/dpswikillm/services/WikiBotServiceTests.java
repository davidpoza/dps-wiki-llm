package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dpswikillm.config.AppProperties;
import com.dpswikillm.domain.JobMode;
import com.dpswikillm.domain.JobStatus;
import com.dpswikillm.domain.JobType;
import com.dpswikillm.dto.EnqueueJobResponse;
import com.dpswikillm.dto.JobEvent;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.client.RestTemplate;
import org.telegram.telegrambots.meta.api.objects.message.Message;
import org.telegram.telegrambots.meta.api.objects.Update;

class WikiBotServiceTests {
    private static final long ALLOWED_CHAT_ID = 12345L;
    private static final long OTHER_CHAT_ID = 99999L;

    private JobQueueService queueService;
    private JobEventService eventService;
    private RawIntakeService rawIntakeService;
    private RestTemplate restTemplate;
    private WikiBotService bot;

    @BeforeEach
    void setUp() {
        queueService = mock(JobQueueService.class);
        eventService = mock(JobEventService.class);
        rawIntakeService = mock(RawIntakeService.class);
        restTemplate = mock(RestTemplate.class);

        AppProperties props = new AppProperties(null, List.of(),
                new AppProperties.Embeddings("http://embeddings:8080", "multilingual-e5-small", "", 384, Duration.ofSeconds(1), 8),
                new AppProperties.Llm("http://localhost", "model", ""),
                new AppProperties.Telegram("bot-token", String.valueOf(ALLOWED_CHAT_ID)), null, null, null, null);

        bot = new WikiBotService(props, queueService, eventService, rawIntakeService, restTemplate);
    }

    @Test
    void unauthorizedChatIsIgnored() throws Exception {
        bot.consume(update(OTHER_CHAT_ID, "hello"));
        verify(queueService, never()).enqueue(any(), any(), any());
        verify(restTemplate, never()).postForEntity(anyString(), any(), any());
    }

    @Test
    void freeTextEnqueuesAnswerJob() throws Exception {
        UUID jobId = UUID.randomUUID();
        when(queueService.enqueue(JobType.ANSWER, JobMode.unattended, "what is DPS?"))
                .thenReturn(new EnqueueJobResponse(jobId, 1));

        bot.consume(update(ALLOWED_CHAT_ID, "what is DPS?"));

        verify(queueService).enqueue(JobType.ANSWER, JobMode.unattended, "what is DPS?");
        verify(eventService).registerTerminalListener(eq(jobId), any());
        ArgumentCaptor<Object> bodyCaptor = ArgumentCaptor.forClass(Object.class);
        verify(restTemplate).postForEntity(contains("/sendMessage"), bodyCaptor.capture(), any());
        assertThat(bodyCaptor.getValue().toString()).contains("enqueued");
    }

    @Test
    void askCommandStripsPrefix() throws Exception {
        UUID jobId = UUID.randomUUID();
        when(queueService.enqueue(JobType.ANSWER, JobMode.unattended, "what is a topic?"))
                .thenReturn(new EnqueueJobResponse(jobId, 1));

        bot.consume(update(ALLOWED_CHAT_ID, "/ask what is a topic?"));

        verify(queueService).enqueue(JobType.ANSWER, JobMode.unattended, "what is a topic?");
    }

    @Test
    void ingestCommandFetchesAndEnqueues() throws Exception {
        String url = "https://example.com/article";
        UUID jobId = UUID.randomUUID();
        when(rawIntakeService.ingestUrl(url)).thenReturn("raw/web/fetched.md");
        when(queueService.enqueue(JobType.INGEST, JobMode.unattended, "raw/web/fetched.md"))
                .thenReturn(new EnqueueJobResponse(jobId, 2));

        bot.consume(update(ALLOWED_CHAT_ID, "/ingest " + url));

        verify(rawIntakeService).ingestUrl(url);
        verify(queueService).enqueue(JobType.INGEST, JobMode.unattended, "raw/web/fetched.md");
        verify(eventService).registerTerminalListener(eq(jobId), any());
    }

    @Test
    void completedJobSendsResultBackToChat() throws Exception {
        UUID jobId = UUID.randomUUID();
        when(queueService.enqueue(any(), any(), any())).thenReturn(new EnqueueJobResponse(jobId, 1));

        AtomicReference<Consumer<JobEvent>> capturedListener = new AtomicReference<>();
        org.mockito.Mockito.doAnswer(invocation -> {
            capturedListener.set(invocation.getArgument(1));
            return null;
        }).when(eventService).registerTerminalListener(any(), any());

        bot.consume(update(ALLOWED_CHAT_ID, "what is Foo?"));

        JobEvent completedEvent = new JobEvent(JobStatus.COMPLETED, jobId, JobType.ANSWER, 0,
                "completed", null, null, "Done", "{\"message\":\"answer ready\"}");
        capturedListener.get().accept(completedEvent);

        ArgumentCaptor<Object> bodyCaptor = ArgumentCaptor.forClass(Object.class);
        verify(restTemplate, org.mockito.Mockito.times(2))
                .postForEntity(contains("/sendMessage"), bodyCaptor.capture(), any());
        assertThat(bodyCaptor.getAllValues().get(1).toString()).contains("Job completed");
    }

    @Test
    void failedJobSendsErrorMessage() throws Exception {
        UUID jobId = UUID.randomUUID();
        when(queueService.enqueue(any(), any(), any())).thenReturn(new EnqueueJobResponse(jobId, 1));

        AtomicReference<Consumer<JobEvent>> capturedListener = new AtomicReference<>();
        org.mockito.Mockito.doAnswer(invocation -> {
            capturedListener.set(invocation.getArgument(1));
            return null;
        }).when(eventService).registerTerminalListener(any(), any());

        bot.consume(update(ALLOWED_CHAT_ID, "fail?"));

        JobEvent failedEvent = new JobEvent(JobStatus.FAILED, jobId, JobType.ANSWER, 0,
                "failed", null, null, "LLM unreachable", null);
        capturedListener.get().accept(failedEvent);

        ArgumentCaptor<Object> bodyCaptor = ArgumentCaptor.forClass(Object.class);
        verify(restTemplate, org.mockito.Mockito.times(2))
                .postForEntity(contains("/sendMessage"), bodyCaptor.capture(), any());
        assertThat(bodyCaptor.getAllValues().get(1).toString()).contains("LLM unreachable");
    }

    private Update update(long chatId, String text) {
        Message message = mock(Message.class);
        when(message.getChatId()).thenReturn(chatId);
        when(message.hasText()).thenReturn(true);
        when(message.getText()).thenReturn(text);
        Update update = mock(Update.class);
        when(update.hasMessage()).thenReturn(true);
        when(update.getMessage()).thenReturn(message);
        return update;
    }
}
