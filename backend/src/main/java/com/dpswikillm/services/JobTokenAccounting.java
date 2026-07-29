package com.dpswikillm.services;

import org.springframework.stereotype.Component;

/**
 * Thread-scoped accumulator that attributes LLM chat-completion token usage to the job currently
 * executing on the calling thread.
 *
 * <p>Jobs run synchronously on their RabbitMQ listener thread, so a {@link ThreadLocal} cleanly
 * bounds all LLM calls a job makes. {@link JobConsumers} opens a context around each job and reads
 * the {@link #snapshot()} to persist. The LLM client calls {@link #record} after each successful
 * completion; when no context is active (e.g. interactive chat or link-explain requests outside any
 * job), {@code record} is a no-op.
 */
@Component
public class JobTokenAccounting {

    public record TokenUsage(long promptTokens, long completionTokens, long totalTokens) {
        public static final TokenUsage EMPTY = new TokenUsage(0, 0, 0);

        public boolean isEmpty() {
            return promptTokens == 0 && completionTokens == 0 && totalTokens == 0;
        }
    }

    private static final class Counter {
        private long promptTokens;
        private long completionTokens;
        private long totalTokens;
    }

    private final ThreadLocal<Counter> current = new ThreadLocal<>();

    /** Starts a fresh accounting context for the current thread. */
    public void open() {
        current.set(new Counter());
    }

    /** Clears the current thread's accounting context. */
    public void close() {
        current.remove();
    }

    /** Adds token counts to the active context, or does nothing when none is open. */
    public void record(long promptTokens, long completionTokens, long totalTokens) {
        Counter counter = current.get();
        if (counter == null) {
            return;
        }
        counter.promptTokens += promptTokens;
        counter.completionTokens += completionTokens;
        counter.totalTokens += totalTokens;
    }

    /** Returns the accumulated totals for the active context, or {@link TokenUsage#EMPTY}. */
    public TokenUsage snapshot() {
        Counter counter = current.get();
        if (counter == null) {
            return TokenUsage.EMPTY;
        }
        return new TokenUsage(counter.promptTokens, counter.completionTokens, counter.totalTokens);
    }
}
