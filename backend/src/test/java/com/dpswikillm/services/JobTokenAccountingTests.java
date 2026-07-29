package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.dpswikillm.domain.Job;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class JobTokenAccountingTests {

    @Test
    void accumulatesAcrossMultipleCalls() {
        JobTokenAccounting accounting = new JobTokenAccounting();
        accounting.open();
        try {
            accounting.record(60, 40, 100);
            accounting.record(50, 40, 90);
            accounting.record(30, 30, 60);

            JobTokenAccounting.TokenUsage usage = accounting.snapshot();
            assertThat(usage.promptTokens()).isEqualTo(140);
            assertThat(usage.completionTokens()).isEqualTo(110);
            assertThat(usage.totalTokens()).isEqualTo(250);
        } finally {
            accounting.close();
        }
    }

    @Test
    void snapshotIsEmptyWithoutContext() {
        JobTokenAccounting accounting = new JobTokenAccounting();
        accounting.record(10, 5, 15); // no-op
        assertThat(accounting.snapshot()).isEqualTo(JobTokenAccounting.TokenUsage.EMPTY);
    }

    @Test
    void concurrentContextsAreIndependent() throws Exception {
        JobTokenAccounting accounting = new JobTokenAccounting();
        CountDownLatch bothRecorded = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<JobTokenAccounting.TokenUsage> first = new AtomicReference<>();
        AtomicReference<JobTokenAccounting.TokenUsage> second = new AtomicReference<>();

        Runnable worker =
                () -> {
                    // Each thread's counters live in its own ThreadLocal, so interleaving must not
                    // mix totals.
                    accounting.open();
                    try {
                        long base = Thread.currentThread().getName().endsWith("A") ? 100 : 7;
                        accounting.record(base, base, base * 2);
                        bothRecorded.countDown();
                        release.await();
                        AtomicReference<JobTokenAccounting.TokenUsage> target =
                                base == 100 ? first : second;
                        target.set(accounting.snapshot());
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        accounting.close();
                    }
                };

        Thread a = new Thread(worker, "worker-A");
        Thread b = new Thread(worker, "worker-B");
        a.start();
        b.start();
        bothRecorded.await();
        release.countDown(); // let both snapshot only after both have recorded
        a.join();
        b.join();

        assertThat(first.get().totalTokens()).isEqualTo(200);
        assertThat(second.get().totalTokens()).isEqualTo(14);
    }

    @Test
    void jobAddTokenUsageIsNullSafeAndAccumulates() {
        Job job = new Job();
        assertThat(job.getTotalTokens()).isNull();

        job.addTokenUsage(60, 40, 100);
        job.addTokenUsage(40, 60, 100);

        assertThat(job.getPromptTokens()).isEqualTo(100);
        assertThat(job.getCompletionTokens()).isEqualTo(100);
        assertThat(job.getTotalTokens()).isEqualTo(200);
    }
}
