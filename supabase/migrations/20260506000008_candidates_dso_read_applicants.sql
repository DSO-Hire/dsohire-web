-- Phase 4.4 detail-page bugfix (2026-05-06):
-- DSO members couldn't read candidate rows (no SELECT policy gated the
-- employer side), so the application detail page rendered "Candidate ·
-- {id_prefix}", "Email unavailable", "No resume on file", and a
-- placeholder avatar — even though all the underlying data was correctly
-- saved. The kanban + leaderboard masked it because they fall back to
-- candidate-id-prefix gracefully and don't try to render avatars/resumes.
--
-- This adds a focused SELECT policy: a DSO member can read a candidate
-- row IFF that candidate has at least one application on a job the DSO
-- member can access. `user_can_access_job` already encodes role +
-- location-scope authorization (including the locked HM scope decision),
-- and runs SECURITY DEFINER so we don't recursively trip applications
-- RLS during evaluation.
--
-- Side-effects:
-- - Storage policy "Resumes: DSO read application resumes" was already
--   correct, but its `EXISTS (SELECT 1 FROM candidates c ...)` join
--   tripped on candidates RLS and returned false. With this new policy
--   in place, signed-URL creation now succeeds.
-- - The auth.admin.getUserById fallback on the detail page also no
--   longer fires unnecessarily, since cand.full_name is now visible.

CREATE POLICY "Candidates: dso members read applicants" ON public.candidates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.candidate_id = candidates.id
        AND public.user_can_access_job(a.job_id)
    )
  );
