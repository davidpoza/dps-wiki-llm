CREATE TABLE users (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username     VARCHAR(80)  UNIQUE NOT NULL,
    email        VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    roles        VARCHAR(255) NOT NULL DEFAULT 'ROLE_USER',
    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
