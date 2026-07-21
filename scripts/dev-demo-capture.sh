#!/bin/bash
# Dev server pointed at the dsohire-demo Supabase project (zfnyljmrgmyyzzntqxnl)
# for marketing capture runs. Port 3100 so it can coexist with the normal dev
# server. Anon key is the demo project's public (publishable) key.
# Service-role paths will 401 harmlessly (prod key vs demo URL) — capture
# flows are candidate/anon surfaces and don't need them.
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_SUPABASE_URL="https://zfnyljmrgmyyzzntqxnl.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpmbnlsam1yZ215eXp6bnRxeG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NDQ5NzAsImV4cCI6MjA5OTUyMDk3MH0.VLFTLOSMuuodzNRLt7JJDmx8K0TSL7t0japB7GaPXbs"
unset SUPABASE_SERVICE_ROLE_KEY
# Post-launch: prod has the preview gate off (Vercel env). Match it here so
# captures and browsing don't hit the coming-soon page.
export PREVIEW_GATE_DISABLED=true
exec npx next dev -p 3100
