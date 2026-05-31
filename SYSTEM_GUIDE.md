# Alaska Wild Lights Reviews Dashboard — System Guide

Internal operations guide for the weekly reviews automation and dashboard.

---

## 1. Overview

This system automates the weekly tracking of customer reviews for Alaska Wild Lights from Google Maps and TripAdvisor, tallies guide-level performance bonuses, and publishes everything to an internal dashboard.

**Components:**

| Component | Purpose | Hosted on |
|---|---|---|
| `WeeklyReviewsEngine.gs` | Weekly scraper + emailer | Google Apps Script |
| Apify actors | Pull raw reviews from Google Maps + TripAdvisor | Apify cloud |
| Gmail | Delivers weekly JSON + holds historical backup | Google |
| `index.html` | Dashboard UI | Netlify |
| Google Sheet (Reviews Tracker) | Guide list + flagged reviews log | Google Sheets |

---

## 2. Weekly Script (`WeeklyReviewsEngine.gs`)

### When it runs
- **Trigger:** time-driven, weekly, Monday morning (configured in Apps Script → Triggers)
- **Entry point:** `runWeeklyReport()`
- **No bootstrap step required** — runs directly with just `APIFY_TOKEN` configured

### What it does (in order)

1. **Determines the date window** — Sunday to Saturday of the previous week (e.g. running on Monday May 25 covers May 17–23)
2. **Loads the guides** from the Google Sheet (16 guides as of May 2026)
3. **Fetches reviews from Apify:**
   - Google Maps → actor `compass~google-maps-reviews-scraper`
   - TripAdvisor → actor `maxcopell~tripadvisor-reviews`
4. **Filters by date range** — keeps only reviews inside the Sunday–Saturday window
5. **Matches reviews to guides** — searches the review text for each guide's full name, last name, or first name. Multi-guide matches counted for each. Reviews with no match are tagged `UNASSIGNED`.
6. **Deduplicates** against `SEEN_REVIEW_IDS` (running state) so the same review never double-counts
7. **Updates Google Sheets** — Weekly Reviews tab + Flagged Reviews tab (1–2 star reviews)
8. **Builds the dashboard JSON** by merging history (see Section 4)
9. **Sends the email** — HTML tables (per-platform 5★ breakdown) + `akwl-reviews-data.json` attached
10. **Persists running state** — only after everything else succeeded, so partial failures don't corrupt totals

### Bonus rules
- Google Maps 5★ review → **$10 to the matched guide**
- TripAdvisor 5★ review → **$5 to the matched guide**
- 1–4 star reviews → no bonus, flagged if 1–2★

### Weekly email contents
- **HTML body:**
  - Google Maps 5★ table (per guide: name | reviews | 5★ | bonus)
  - TripAdvisor 5★ table (same columns)
  - Bonus total for the week
- **Attachment:** `akwl-reviews-data.json` — complete history including all weekly entries to date

---

## 3. Dashboard (`index.html` on Netlify)

### Loading new data each week

1. Open the email titled `AKWL Weekly Reviews — <week label>` and save the `akwl-reviews-data.json` attachment
2. Open the dashboard at the Netlify URL
3. Click **↑ Upload data.json** → select the attachment
4. Verify the data looks right (new week appears, KPIs updated)
5. Click **↓ Download index.html** — this bakes the new data into a fresh `index.html`
6. Deploy that file to Netlify (drag & drop on the Netlify dashboard, or push to GitHub if the repo is connected)
7. **Done** — all devices now see the updated data

### Dashboard sections (top to bottom)

| Section | What it shows |
|---|---|
| **Header** | YTD average pill + Upload button + last entry date |
| **YTD Gauge** | Combined average rating across all platforms, progress to 5.0★ |
| **KPI cards** | YTD Reviews · This Week · YTD Bonuses Paid |
| **Platforms — YTD** | Per-platform breakdown of count, average, 5★ count |
| **Monthly Performance** | Bench grid: combined avg per month, target ≥ 4.5★ |
| **Average rating trend** | Line chart — Monthly or Weekly view, per platform |
| **Reviews per period** | Bar chart — Monthly or Weekly, stacked or grouped |
| **Week range filter** | Appears when either chart is in Weekly view — filters the date range shown |
| **5★ reviews per guide** | Bar chart — YTD or This Week |
| **Guide performance table** | This Week 5★ · This Week Bonus · YTD 5★ |
| **Week-over-week comparison** | Last 2 weeks side by side with delta indicators |
| **Low-rating reviews** | 1–2★ reviews this week with guide + platform + text |

### Chart views
- **Monthly view** — one bar/point per calendar month (Jan–Dec 2026)
- **Weekly view** — one bar/point per week. Initially only May 2026 onward (Jan–Apr was tracked monthly only).
- **Custom range** — From/To dropdowns appear when Weekly is selected. Pick any range and click Apply.

---

## 4. History Protection

History is protected by a three-layer strategy so data can never be lost:

### Layer 1: `HISTORY_BASELINE_2026` constant (hardcoded in script)
- Permanent floor with Jan–April monthly totals, `byGuide` 5★ counts, and the 3 May 2026 weeks
- Lives in the script source — survives any data corruption elsewhere
- Reference: lines ~85–190 of `WeeklyReviewsEngine.gs`

### Layer 2: Last emailed JSON
- Function `readLastEmailedJSON()` searches Gmail for the most recent `AKWL Weekly Reviews` email
- Pulls the attached `akwl-reviews-data.json`
- Recovers any weeks added since the baseline was last updated

### Layer 3: Current week
- The freshly scraped week, computed from this run

### Merge priority (lowest → highest)
```
HISTORY_BASELINE_2026.weekly  →  email JSON weekly entries  →  current week
```
Each layer can override the one below for the same `weekLabel`. Monthly totals + `byGuide` are then **rebuilt** from the merged weekly entries, using `HISTORY_BASELINE_2026.monthly` / `.byGuide` as a permanent floor (so Jan–Apr is never lost).

### Why nothing can be lost
- Delete an email? Script re-uses the baseline + the next email
- All emails gone? Baseline still has Jan–May, future weeks rebuild from there
- Script source corrupted? Restore from git history (commit `claude/rebuild-reviews-dashboard-KX41r`)

---

## 5. Setup / Configuration

### Required (one-time)

**Script Properties** (Apps Script → Project Settings → Script properties):

| Key | Value |
|---|---|
| `APIFY_TOKEN` | Your Apify API token |
| `EMAIL_TO` | `info@alaskawildlights.com` (or wherever you want the JSON delivered) |

**Trigger** (Apps Script → Triggers → Add Trigger):
- Function: `runWeeklyReport`
- Event source: Time-driven
- Type: Week timer
- Day: Monday
- Time: 6 AM – 7 AM (or any morning slot)

**Guides list** — maintained in the linked Google Sheet (the `Employee Info` tab). Add or remove rows there; the script reads the list on every run.

### GitHub auto-deploy (READY TO ACTIVATE)

The script now supports automatic GitHub push → Netlify deploy. **Status:** Code ready, just needs token + Netlify connection.

**Activation steps:**

1. Generate a GitHub Personal Access Token:
   - Go to https://github.com/settings/tokens → "Tokens (classic)" → "Generate new token"
   - Name: `AKWL Apps Script`
   - Expiration: 1 year (or no expiration if preferred)
   - Scopes: tick **`repo`** (full control of repositories)
   - Click "Generate" and **copy immediately** (won't show again)

2. Add to Apps Script Properties:
   - Open Apps Script → Project Settings → Script properties → Add property
   - `GITHUB_TOKEN` = paste the token you just generated
   - `GITHUB_OWNER` = `alaskawildlights` (already defaults to this)
   - `GITHUB_REPO` = `akwl-reviews` (already defaults to this)

3. Connect Netlify to GitHub:
   - Go to Netlify dashboard → your site → **Site settings → Build & deploy → Continuous deployment**
   - Click **Link site to Git** → select `alaskawildlights/akwl-reviews` → branch `main`
   - Leave build command empty, publish directory = `.`
   - Save

**After setup:** Each Monday at 6 AM, the script will:
1. Scrape reviews from Apify
2. Send email with HTML tables + JSON
3. **Push data.json to GitHub**
4. **Netlify webhook triggers auto-deploy**
5. All devices see updated dashboard within seconds — zero manual steps

---

## 6. Historical Data Integration

### Obtaining Complete TripAdvisor Review History

The current system includes TripAdvisor data from 2025-01 onwards (~775 reviews). To add complete historical data (pre-2025, potentially 5000+ total reviews):

**Option A: Scrape all-time (recommended for completeness)**
- Run Apify `maxcopell~tripadvisor-reviews` actor with:
  - No date filter (leave empty to get all reviews)
  - Expected cost: ~$25–50 depending on actual count
  - Expected results: 1000–2000+ reviews covering the business's entire TripAdvisor history

**Option B: Scrape 2025-forward only (cost-efficient)**
- Keeps current approach
- Expected cost: ~$15–25
- Expected results: ~850–900 reviews

**Once you have the CSV:**

1. Convert the CSV data into the same format as Jan–Apr baseline (see `HISTORY_BASELINE_2026.monthly` in the script)
2. Edit `HISTORY_BASELINE_2026.monthly` to add pre-2025 months (e.g., 2024-12, 2024-11, etc.)
3. Also update `HISTORY_BASELINE_2026.byGuide` with per-guide 5-star counts for pre-2025 periods
4. Re-deploy the script
5. Upload the updated `index.html` with baked-in historical data

**Integration helper:** Use `util_GenerateMonthlyBaseline()` to auto-tally any new monthly period you add.

---

## 7. GitHub + Netlify auto-deploy (SETUP READY)

Switching from "email → manual upload → manual deploy" to "fully automatic" is a 5-minute setup. Worth doing because:
- All devices see the new data without any manual step
- GitHub commit history is a permanent backup
- No risk of forgetting to deploy

### Step 1 — Connect Netlify to GitHub
1. Netlify dashboard → your site → **Site settings → Build & deploy → Continuous deployment**
2. Click **Link site to Git** → select `alaskawildlights/akwl-reviews` → branch `main`
3. Build command: leave empty. Publish directory: `.` (root)
4. Save. Now every push to `main` triggers a redeploy.

### Step 2 — Create a GitHub token
1. github.com → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**
2. Name: `AKWL Apps Script`. Expiration: 1 year.
3. Scopes: tick **`repo`** (full control of private repositories).
4. Generate. **Copy the token immediately** — it won't be shown again.

### Step 3 — Add token to Apps Script
- Script Properties → add `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` as in Section 5.

### Step 4 — Enable the GitHub push path in the script
- The function `pushToGitHub()` already exists in the script
- Re-enable the call in `runWeeklyReport()` (currently disabled because the integration isn't live yet)
- After that, each weekly run will push `data/latest.json` to the repo

### ---

## 8. Quick reference — what to do when…

### …the Monday script didn't run
1. Open Apps Script → **Executions** tab → check for the latest `runWeeklyReport` entry
2. If it failed, click it to see the stack trace
3. Common causes:
   - `APIFY_TOKEN` expired or hit rate limit → renew the token in Script Properties
   - Apify actor down → re-run manually from Apps Script editor: `runWeeklyReport()`
4. If no execution at all, check Triggers — the trigger may have been deleted. Re-create it.

### …the email arrived but the dashboard isn't updating
- Make sure you uploaded the **latest** `akwl-reviews-data.json` (from this week's email)
- Click **↓ Download index.html** after uploading, then deploy that file
- If you forgot to deploy and just refreshed the page, only your browser's localStorage has the new data — other devices still see the old baked-in version

### …a guide is missing from the report
- Open the linked Google Sheet → `Employee Info` tab → add the guide's full name in a new row
- Re-run `runWeeklyReport()` manually from Apps Script
- The new guide will appear in next week's report automatically

### …you need to manually add a week (e.g. scraping failed)
- Use `util_AddManualWeek()` in the script (parameters: weekLabel, startDate, endDate, manual platform totals, manual guide breakdown)
- It seeds from `HISTORY_BASELINE_2026.weekly` first, then the last email, then adds your manual entry

### …you want to refresh the baseline (e.g. add June as estimated month)
- Run `util_GenerateMonthlyBaseline()` on the first Monday of the new month
- It emails you a ready-to-paste JavaScript snippet for `HISTORY_BASELINE_2026.monthly`
- Paste the snippet into the script, save, done

### …you need historical weekly data for Jan–Apr
- That data was only tracked monthly. To convert to weekly:
  - Edit `HISTORY_BASELINE_2026.weekly` and add entries with the appropriate `weekLabel`, `startDate`, `endDate`, `platforms`, `guides`
  - The weekly charts will pick them up automatically on next run

---

## 9. Key files & locations

| File | Where | Purpose |
|---|---|---|
| `WeeklyReviewsEngine.gs` | Apps Script project | Weekly scraping + emailing |
| `index.html` | GitHub `alaskawildlights/akwl-reviews` `main` branch | Dashboard UI |
| `HISTORY_BASELINE_2026` | Inside `WeeklyReviewsEngine.gs` (lines ~85–190) | Permanent historical floor |
| `DEFAULT_DATA` | Inside `index.html` (between `@@BAKED_DATA_START@@` / `@@BAKED_DATA_END@@`) | Baked-in data shown when no upload |
| Google Sheet — Reviews Tracker | linked from script `getConfig()` | Guide list, flagged reviews log, weekly reviews log |

---

## 10. Contact / troubleshooting

- **Apps Script project owner:** Alaska Wild Lights (info@alaskawildlights.com)
- **Dashboard URL:** Netlify-hosted (check Netlify dashboard for current URL)
- **Source code branch:** `claude/rebuild-reviews-dashboard-KX41r`

---

*Last updated: May 2026 · System version: v4.17*
