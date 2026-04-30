/**
 * Database type — generated from the Supabase schema.
 *
 * Regenerate after every migration via:
 *   npx supabase gen types typescript \
 *     --project-id viapivvlhjqvjhoflxmp \
 *     --schema public \
 *     > src/lib/supabase/database.types.ts
 *
 * (Or use `supabase login` + `supabase link` for the local dev workflow once
 * we've installed the Supabase CLI in Phase 2 Week 2.)
 *
 * Until the migration runs and types are regenerated, this file holds a stub
 * so TypeScript imports in browser.ts / server.ts compile.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
