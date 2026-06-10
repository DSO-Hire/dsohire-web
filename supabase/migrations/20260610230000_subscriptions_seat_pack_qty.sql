-- #88 seat packs — number of +3 seat-pack add-ons purchased on top of the
-- plan's base seat cap. The webhook recomputes this from the Stripe
-- subscription's seat-pack line item; resolveCaps() adds qty × 3 to maxSeats.
-- 0 = no packs (the default). Applied to prod via the connector on 2026-06-10;
-- repo-sync file.
alter table subscriptions add column if not exists seat_pack_qty integer not null default 0;
