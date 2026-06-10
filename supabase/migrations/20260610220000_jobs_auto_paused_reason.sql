-- #88 downgrade resolver — flag jobs auto-paused because a plan downgrade put
-- the DSO over its active-openings cap. Lets the jobs page surface a
-- "choose what to reactivate" banner. NULL = not system-paused. Applied to
-- prod via the connector on 2026-06-10; repo-sync file.
alter table jobs add column if not exists auto_paused_reason text;
