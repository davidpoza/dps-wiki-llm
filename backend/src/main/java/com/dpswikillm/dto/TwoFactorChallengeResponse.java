package com.dpswikillm.dto;

public record TwoFactorChallengeResponse(boolean twoFactorRequired, String challengeToken) {
    public static TwoFactorChallengeResponse required(String challengeToken) {
        return new TwoFactorChallengeResponse(true, challengeToken);
    }
}
