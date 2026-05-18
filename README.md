# Alaska Wild Lights — Reviews Dashboard

Single self-contained `index.html` with data baked in. Drag-and-drop deploy.

## Deploy (10 seconds)

1. Open <https://app.netlify.com/drop>
2. Drag `index.html` into the page.
3. Done — Netlify gives you a public URL.

No build, no server, no tokens, no GitHub Pages cache to fight.

## How it works

- `WeeklyReviewsEngine.gs` runs every week in Google Apps Script. It scrapes Google Maps + TripAdvisor via Apify, matches reviews to guides, calculates bonuses, and pushes a fresh `index.html` (with data baked in) to this repo's `main` branch.
- To publish the update, drag the new `index.html` to Netlify Drop. (Or set up Netlify auto-deploy from GitHub — see below.)
- The dashboard runs entirely client-side. No runtime fetches, no cache games.

## Manual data upload

The dashboard has an **↑ Upload data.json** button. Drop a `data.json` exported by the Apps Script and the dashboard re-renders without any redeploy. Useful for ad-hoc previews.

## Files

| File | Purpose |
|---|---|
| `index.html` | The deployable dashboard. Data baked in. Drag to Netlify. |
| `index.template.html` | Template with `/*__DATA_JSON__*/` placeholder. The Apps Script fills this in. |
| `data.json` | Latest data snapshot. Source of truth. Apps Script regenerates weekly. |
| `WeeklyReviewsEngine.gs` | Google Apps Script that scrapes + emails + pushes. |

## Historical data

`history.monthly` for Jan–Apr 2026 was seeded from the team's Reviews Tracker spreadsheet. From May 2026 onward, `WeeklyReviewsEngine.gs` appends to it automatically.

YTD bonuses for Jan–Apr are **estimates** (weighted by each month's Google/TripAdvisor 5★ mix). From May onward, bonuses are tracked precisely.

## Optional: auto-deploy from GitHub

1. In Netlify, "Add new site" → "Import from Git" → pick this repo.
2. Build command: leave empty.
3. Publish directory: `/`.
4. Every push to `main` re-publishes. No drag-and-drop needed.
