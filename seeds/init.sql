-- File: seeds/init.sql
CREATE TABLE exports (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    filters JSONB,
    columns TEXT,
    delimiter CHAR(1),
    quote_char CHAR(1)
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    signup_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    country_code CHAR(2) NOT NULL,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    lifetime_value NUMERIC(10, 2) DEFAULT 0.00
);

-- Add indexes for efficient filtering
CREATE INDEX idx_users_country_code ON users(country_code);
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX idx_users_lifetime_value ON users(lifetime_value);

-- Seed 10 million rows
INSERT INTO users (name, email, country_code, subscription_tier, lifetime_value, signup_date)
SELECT 
    'User ' || i,
    'user' || i || '@example.com',
    (ARRAY['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'IN', 'JP', 'BR', 'MX'])[floor(random() * 10 + 1)],
    (ARRAY['free', 'basic', 'premium', 'enterprise'])[floor(random() * 4 + 1)],
    (random() * 1000)::numeric(10, 2),
    now() - (random() * interval '365 days')
FROM generate_series(1, 10000000) s(i);
