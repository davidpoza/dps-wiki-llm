package com.dpswikillm.security;

import dev.samstevens.totp.code.CodeVerifier;
import dev.samstevens.totp.code.DefaultCodeGenerator;
import dev.samstevens.totp.code.DefaultCodeVerifier;
import dev.samstevens.totp.code.HashingAlgorithm;
import dev.samstevens.totp.exceptions.QrGenerationException;
import dev.samstevens.totp.qr.QrData;
import dev.samstevens.totp.qr.QrGenerator;
import dev.samstevens.totp.qr.ZxingPngQrGenerator;
import dev.samstevens.totp.secret.DefaultSecretGenerator;
import dev.samstevens.totp.secret.SecretGenerator;
import dev.samstevens.totp.time.SystemTimeProvider;
import dev.samstevens.totp.time.TimeProvider;
import dev.samstevens.totp.util.Utils;
import org.springframework.stereotype.Service;

/**
 * RFC 6238 TOTP helper: generates secrets, otpauth provisioning URIs / QR images,
 * and verifies 6-digit codes with a ±1 time-step tolerance for clock drift.
 */
@Service
public class TotpService {

    private static final String ISSUER = "DPS Wiki";
    private static final int DIGITS = 6;
    private static final int PERIOD_SECONDS = 30;

    private final SecretGenerator secretGenerator = new DefaultSecretGenerator();
    private final QrGenerator qrGenerator = new ZxingPngQrGenerator();
    private final CodeVerifier codeVerifier;

    public TotpService() {
        TimeProvider timeProvider = new SystemTimeProvider();
        DefaultCodeVerifier verifier = new DefaultCodeVerifier(new DefaultCodeGenerator(), timeProvider);
        verifier.setAllowedTimePeriodDiscrepancy(1);
        this.codeVerifier = verifier;
    }

    public String generateSecret() {
        return secretGenerator.generate();
    }

    public QrData qrData(String username, String secret) {
        return new QrData.Builder()
                .label(username)
                .secret(secret)
                .issuer(ISSUER)
                .algorithm(HashingAlgorithm.SHA1)
                .digits(DIGITS)
                .period(PERIOD_SECONDS)
                .build();
    }

    public String otpauthUri(String username, String secret) {
        return qrData(username, secret).getUri();
    }

    /** Returns a {@code data:image/png;base64,...} URI for the enrollment QR code. */
    public String qrDataUri(String username, String secret) {
        try {
            byte[] image = qrGenerator.generate(qrData(username, secret));
            return Utils.getDataUriForImage(image, qrGenerator.getImageMimeType());
        } catch (QrGenerationException e) {
            throw new IllegalStateException("Failed to generate 2FA QR code", e);
        }
    }

    public boolean isValidCode(String secret, String code) {
        return secret != null && code != null && codeVerifier.isValidCode(secret, code);
    }
}
