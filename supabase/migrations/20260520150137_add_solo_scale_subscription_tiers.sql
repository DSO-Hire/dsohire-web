-- Pricing repositioning 2026-05-20: 4-tier ladder Solo / Growth / Scale / Enterprise.
-- 'growth' and 'enterprise' enum values are reused (repriced in app config).
-- 'starter' is retained as a harmless legacy value (no supported way to drop a
-- Postgres enum value without recreating the type; pre-launch there are no real
-- Starter subscriptions). Add the two new tier values; append-only is fine since
-- display order comes from PRICING_TIER_ORDER in app code, not enum sort order.
ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'solo';
ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'scale';
