package com.dpswikillm.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.interceptor.RetryInterceptorBuilder;
import org.springframework.retry.interceptor.RetryOperationsInterceptor;

@Configuration
public class RabbitConfig {
    public static final String EXCHANGE = "wiki-jobs";
    public static final String DLX = "wiki-jobs-dlx";
    public static final String WRITE_QUEUE = "wiki-write-jobs";
    public static final String ANSWER_QUEUE = "answer-jobs";
    public static final String DEAD_LETTER_QUEUE = "wiki-jobs-dead-letter";

    @Bean
    public DirectExchange jobExchange() {
        return new DirectExchange(EXCHANGE, true, false);
    }

    @Bean
    public DirectExchange deadLetterExchange() {
        return new DirectExchange(DLX, true, false);
    }

    @Bean
    public Queue writeQueue() {
        return QueueBuilder.durable(WRITE_QUEUE).withArgument("x-dead-letter-exchange", DLX).build();
    }

    @Bean
    public Queue answerQueue() {
        return QueueBuilder.durable(ANSWER_QUEUE).withArgument("x-dead-letter-exchange", DLX).build();
    }

    @Bean
    public Queue deadLetterQueue() {
        return QueueBuilder.durable(DEAD_LETTER_QUEUE).build();
    }

    @Bean
    public Binding writeBinding() {
        return BindingBuilder.bind(writeQueue()).to(jobExchange()).with(WRITE_QUEUE);
    }

    @Bean
    public Binding answerBinding() {
        return BindingBuilder.bind(answerQueue()).to(jobExchange()).with(ANSWER_QUEUE);
    }

    @Bean
    public Binding deadLetterBinding() {
        return BindingBuilder.bind(deadLetterQueue()).to(deadLetterExchange()).with(WRITE_QUEUE);
    }

    @Bean
    public Jackson2JsonMessageConverter jackson2JsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RetryOperationsInterceptor jobRetryInterceptor() {
        return RetryInterceptorBuilder.stateless()
                .maxAttempts(3)
                .recoverer((args, cause) -> {
                    throw new AmqpRejectAndDontRequeueException("Job retries exhausted", cause);
                })
                .build();
    }

    @Bean
    @ConditionalOnBean(ConnectionFactory.class)
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(ConnectionFactory connectionFactory,
                                                                        Jackson2JsonMessageConverter converter,
                                                                        RetryOperationsInterceptor jobRetryInterceptor) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(converter);
        factory.setPrefetchCount(1);
        factory.setConcurrentConsumers(1);
        factory.setMaxConcurrentConsumers(1);
        factory.setAdviceChain(jobRetryInterceptor);
        return factory;
    }
}
