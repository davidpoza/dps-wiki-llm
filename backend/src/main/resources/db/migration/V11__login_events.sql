CREATE TABLE login_events (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    username    VARCHAR(80) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address  VARCHAR(45),
    country     VARCHAR(100),
    region      VARCHAR(100),
    success     BOOLEAN     NOT NULL,
    failure_reason VARCHAR(100)
);

CREATE INDEX idx_login_events_user_created ON login_events (user_id, created_at DESC);
