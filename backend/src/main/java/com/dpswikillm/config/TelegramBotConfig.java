package com.dpswikillm.config;

import com.dpswikillm.services.JobEventService;
import com.dpswikillm.services.JobQueueService;
import com.dpswikillm.services.RawIntakeService;
import com.dpswikillm.services.WikiBotService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;
import org.telegram.telegrambots.longpolling.starter.SpringLongPollingBot;
import org.telegram.telegrambots.longpolling.util.LongPollingSingleThreadUpdateConsumer;

@Configuration
@ConditionalOnExpression("!'${app.telegram.token:}'.trim().isEmpty()")
public class TelegramBotConfig {
    private static final Logger log = LoggerFactory.getLogger(TelegramBotConfig.class);

    @Bean
    public WikiBotService wikiBotService(
            AppProperties props,
            JobQueueService queueService,
            JobEventService eventService,
            RawIntakeService rawIntakeService) {
        log.info("Telegram bot enabled for chat {}", props.telegram().allowedChatId());
        return new WikiBotService(
                props, queueService, eventService, rawIntakeService, new RestTemplate());
    }

    @Bean
    public SpringLongPollingBot springLongPollingBot(
            AppProperties props, WikiBotService wikiBotService) {
        String token = props.telegram().token();
        return new SpringLongPollingBot() {
            @Override
            public String getBotToken() {
                return token;
            }

            @Override
            public LongPollingSingleThreadUpdateConsumer getUpdatesConsumer() {
                return wikiBotService;
            }
        };
    }
}
