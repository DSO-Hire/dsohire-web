# DSO Hire launch marketing assets

Produced 2026-07-10 by the dsohire-marketing pipeline (source comps + raw
footage live in the sibling `dsohire-studio` repo). Palette: product-repo
canon (#14233F / #F7F4ED / #4D7A60 / #8DB8A3), Manrope only, logo geometry
verbatim from the canon SVGs.

| File | Dimensions | Duration | Intended use |
|------|-----------|----------|--------------|
| `launch-video-final.mp4` | 1920x1080 | 63s | Hero. LinkedIn native upload + site embed. Music + VO (Brian, ElevenLabs). |
| `linkedin-feed-1x1.mp4` | 1080x1080 | 28s | LinkedIn feed workhorse. Captions burned, music-only — works muted. |
| `linkedin-vertical-9x16.mp4` | 1080x1920 | 24s | LinkedIn vertical / mobile. Captions clear of the bottom UI safe area. |
| `logo-reveal.mp4` | 1920x1080 | 5s | Brand sting. Also the source of the end-card motif on every clip. |
| `og-image.png` | 1200x630 | — | LinkedIn post / link-preview material. NOTE: the site's `og:image` is served dynamically by `src/app/opengraph-image.tsx` and was intentionally NOT replaced. |
| `linkedin-banner.png` | 1128x191 | — | LinkedIn company page header. |
| `readme-demo.gif` | 1000px wide | 7s loop | GitHub README / docs. Kanban drag demo, navy loop fades. |
| `gallery.html` | — | — | Contact sheet of everything above (open via the site: `/media/marketing/gallery.html`). |

Upload rule: LinkedIn videos are always **native uploads** — never a
YouTube link (external links get suppressed in feed reach).
