package com.dpswikillm.services;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PipelineTxTests {
    @Test
    void rollbackRunsCompensationsInReverseOrder() throws Exception {
        PipelineTx tx = new PipelineTx();
        List<String> calls = new ArrayList<>();

        tx.onRollback("first", () -> calls.add("first"));
        tx.onRollback("second", () -> calls.add("second"));
        tx.rollback();

        assertThat(calls).containsExactly("second", "first");
    }
}
