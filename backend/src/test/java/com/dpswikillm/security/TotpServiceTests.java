package com.dpswikillm.security;

import static org.assertj.core.api.Assertions.assertThat;

import dev.samstevens.totp.code.CodeGenerator;
import dev.samstevens.totp.code.DefaultCodeGenerator;
import dev.samstevens.totp.time.SystemTimeProvider;
import org.junit.jupiter.api.Test;

class TotpServiceTests {

    private final TotpService totpService = new TotpService();
    private final CodeGenerator codeGenerator = new DefaultCodeGenerator();
    private final SystemTimeProvider timeProvider = new SystemTimeProvider();

    private String currentCode(String secret) throws Exception {
        long counter = Math.floorDiv(timeProvider.getTime(), 30);
        return codeGenerator.generate(secret, counter);
    }

    @Test
    void generatedSecret_isNonBlank() {
        assertThat(totpService.generateSecret()).isNotBlank();
    }

    @Test
    void validCode_passesVerification() throws Exception {
        String secret = totpService.generateSecret();
        assertThat(totpService.isValidCode(secret, currentCode(secret))).isTrue();
    }

    @Test
    void wrongCode_failsVerification() {
        String secret = totpService.generateSecret();
        assertThat(totpService.isValidCode(secret, "000000")).isFalse();
    }

    @Test
    void nullInputs_failVerification() {
        String secret = totpService.generateSecret();
        assertThat(totpService.isValidCode(secret, null)).isFalse();
        assertThat(totpService.isValidCode(null, "123456")).isFalse();
    }

    @Test
    void otpauthUri_containsIssuerAndSecret() {
        String secret = totpService.generateSecret();
        String uri = totpService.otpauthUri("alice", secret);
        assertThat(uri).startsWith("otpauth://totp/").contains(secret);
    }
}
