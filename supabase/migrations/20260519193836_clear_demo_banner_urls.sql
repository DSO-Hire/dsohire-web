-- ============================================================
-- Clear banner_url on the demo DSOs in favor of brand-color gradient.
-- ============================================================
-- Cam 2026-05-19: the Unsplash dental-procedure photos seeded with
-- companies_demo_seed (Lakeshore, Bridgeway) crop badly under
-- object-cover/bg-cover at the spotlight + /companies/[slug] hero
-- sizes. Result reads as "uncomfortably zoomed dental mouth," not
-- "polished DSO brand."
--
-- Fix: clear those banner_urls so the brand-color gradient fallback
-- (already implemented in both the spotlight card and the detail-page
-- hero) renders instead. Consistent, on-brand, no image-picking risk.
--
-- DSOs that upload their own banner via /employer/settings/profile
-- still get their image rendered — only the demo placeholders are
-- nulled here.
-- ============================================================

update public.dsos
set banner_url = null
where slug in (
  'lakeshore-dental-group',
  'riverstone-dental-partners',
  'summit-dental-group',
  'bridgeway-dental-operations'
);
