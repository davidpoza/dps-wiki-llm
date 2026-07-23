package com.dpswikillm.services;

import java.util.ArrayDeque;
import java.util.Deque;

public class PipelineTx {
    private final Deque<Compensation> compensations = new ArrayDeque<>();

    public void onRollback(String name, ThrowingRunnable action) {
        compensations.push(new Compensation(name, action));
    }

    public void rollback() throws Exception {
        Exception failure = null;
        while (!compensations.isEmpty()) {
            Compensation compensation = compensations.pop();
            try {
                compensation.action().run();
            } catch (Exception ex) {
                if (failure == null) {
                    failure =
                            new IllegalStateException(
                                    "Rollback compensation failed: " + compensation.name(), ex);
                } else {
                    failure.addSuppressed(ex);
                }
            }
        }
        if (failure != null) {
            throw failure;
        }
    }

    public void clear() {
        compensations.clear();
    }

    public interface ThrowingRunnable {
        void run() throws Exception;
    }

    private record Compensation(String name, ThrowingRunnable action) {}
}
