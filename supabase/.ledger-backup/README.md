# Migration ledger reconciliation — 2026-05-14

## What happened

`supabase_migrations.schema_migrations` (the migration ledger) had drifted from
the repo's `supabase/migrations/*.sql` files:

- **52 of 77 migrations were missing from the ledger** — applied via the SQL
  Editor paste workflow, which never writes a ledger row.
- **The 25 that were tracked had `apply_migration`-generated timestamp versions**
  (e.g. `20260513204230`) that did not match their repo filename prefixes
  (e.g. `20260513000005`).

The **live schema was fully correct** — verified by parsing every untracked
migration file for the objects it creates (134 tables/columns/functions/enums)
and confirming 133 exist live. The one absent object (`application_status` enum)
was deliberately `drop type`-d by the `pipeline_stages` migration. Nothing was
lost; only the ledger bookkeeping was wrong.

## What was done

`reconcile_ledger_20260514.sql` — one transaction, touching ONLY the ledger
table (zero DDL):

1. UPDATE the 25 tracked rows: `version` set to the repo filename prefix
   (matched by `name`). `statements`/`rollback`/`created_by`/`name` untouched —
   proven byte-identical afterward via md5 comparison against the snapshot.
2. INSERT 52 rows for the untracked migrations (`migration repair` semantics:
   marked applied, empty `statements` — the repo `.sql` files are the source of
   truth for the SQL).
3. In-transaction assertion: all 77 expected `(version, name)` pairs present.

Result: ledger = 77 rows, versions match repo filenames 1:1.

## Files

- `ledger_snapshot_pre_reconcile_20260514.json` — the 25 pre-reconcile rows
  (version, name, statements md5). Restore reference if ever needed.
- `reconcile_ledger_20260514.sql` — the exact SQL that was run.

## Going forward

New migrations must be added to the ledger with a `version` equal to their repo
filename prefix (NOT the auto-timestamp `apply_migration` generates). Run the
DDL, then insert the ledger row with the matching version.
