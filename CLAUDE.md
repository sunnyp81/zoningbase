# zoningbase.com

Astro 5 (SSR, `@astrojs/cloudflare` adapter) + D1, programmatic US zoning code database. Deploys via Cloudflare Pages on `git push` to `master` (GitHub-connected, `pages_build_output_dir = ./dist`). GA4 property 531851676, measurement ID `G-GQX27HNP19` (installed in `src/layouts/Base.astro`).

## Brain

- 2026-07-10: First conversion surface added. GA4 (28-day window) shows the zoning-detail template (`/[state]/[county]/[city]/zoning/[zone]/`) is the highest cumulative page-view page type on the site (homepage leads on a single-URL basis at 65 views, but the ~75 distinct zoning pages sum to well over 150). That page already had lead-capture markup with no `action`/honeypot, so it never actually submitted. Wired it to StaticForms (`sf_9e906eb6c00416b9d3354749`, honeypot field `name="honeypot" style="display:none"`) and added a delegated GA4 `form_submit` event listener in `Base.astro` that fires for any StaticForms form on the page (covers both the zoning-detail lead form and the existing `/contact/` form). No copy/heading changes, wiring only. Commit `19719d4`.
- Blocked on Sunny: mark `form_submit` as a key event in the GA4 UI for property 531851676 (Admin cannot be automated from here).
