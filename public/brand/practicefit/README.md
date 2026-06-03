# PracticeFit — production logo assets

Direction 01 (heritage sparkle), locked 2026-06-03. Two-tone wordmark: navy `Practice` + heritage `Fit`, one word, capital P and F, with the heritage sparkle on the cap-height centerline. The sparkle alone is the icon/favicon. The score-chip pill is kept as an emphasis variant (see the finalists PDF), not the base mark.

All text is converted to vector outlines, so the SVGs render identically on any machine without Manrope installed.

## Colors (locked palette)
- Navy ink `#14233F` — `Practice`, mono mark, dark surfaces
- Heritage `#4D7A60` — `Fit`, sparkle, ™
- Heritage light `#6B9279` — `Fit` + sparkle on dark surfaces
- Ivory `#F7F4ED` — reversed type on dark/heritage

## Trademark (™)
Use a `-tm` lockup on the first / most prominent appearance on a surface (marketing hero, footer, first mention). Use the clean (non‑tm) lockup for UI chrome — nav, favicon, score chip, anything small — where ™ would clutter or go illegible. ™ is heritage green to match `Fit`; a navy ™ is a one-line swap if preferred.

## Files

### svg/  (master vectors — prefer these on the web)
- `practicefit-primary-on-light(.svg / -tm.svg)` — default, on light/ivory
- `practicefit-reversed-on-dark(.svg / -tm.svg)` — on navy/photos
- `practicefit-on-heritage(.svg / -tm.svg)` — on the heritage green
- `practicefit-mono-navy(.svg / -tm.svg)` — one-color navy
- `practicefit-mono-ivory(.svg / -tm.svg)` — one-color ivory (on dark)
- `mark-sparkle-heritage / -navy / -ivory.svg` — standalone sparkle icon
- `appicon-navy.svg` (heritage sparkle on navy tile), `appicon-heritage.svg` (ivory sparkle on heritage tile)

### png/  (transparent background)
- `lockups/` — each lockup at heights 48/64/96/128/256 px + `-2x` (512)
- `icons/` — each icon at 16/32/48/64/128/256/512/1024 px
- `favicon.ico` (16/32/48/64), `apple-touch-icon-180.png`

## Quick usage
- Website header / app nav → `mark-sparkle` + `practicefit-primary-on-light.svg` (clean)
- Browser tab → `favicon.ico`; iOS home screen → `apple-touch-icon-180.png` / `appicon-navy`
- Dark hero / email banner → `practicefit-reversed-on-dark.svg`
- Marketing first-use → the matching `-tm` lockup
- Score chip / in-product → the sparkle glyph (and the pill variant for emphasis)
