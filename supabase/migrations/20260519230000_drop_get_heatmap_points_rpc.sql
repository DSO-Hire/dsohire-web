-- Drop the get_heatmap_points RPC.
--
-- Built 2026-05-19 to feed the deck.gl GeoJSON hex pipeline (Phase D
-- Day 1). After the Day 4 pivot to a native Mapbox heatmap layer
-- driven by the in-memory metros prop, nothing calls this RPC.
-- Removing it shrinks the API surface area and prevents drift.
--
-- Safe to drop: no jobs/apps/edge-functions reference it.
-- Re-adding later (e.g., if we revisit pre-aggregation) is one
-- migration away.

DROP FUNCTION IF EXISTS public.get_heatmap_points();
