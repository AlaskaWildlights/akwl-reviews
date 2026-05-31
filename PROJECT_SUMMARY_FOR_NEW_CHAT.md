# AKWL Reviews Dashboard — Complete Project Summary
## (Handoff document for a new Claude chat session)

**Date written:** May 31, 2026  
**Repo:** `alaskawildlights/akwl-reviews`  
**Branch:** `claude/rebuild-reviews-dashboard-KX41r`  
**Next weekly run:** Monday June 2, 2026 at 6 AM Alaska time

---

## 1. What this project is

Alaska Wild Lights is a northern lights tour company in Fairbanks, AK. This system automates their weekly customer review tracking (Google Maps + TripAdvisor), calculates guide performance bonuses ($10/5★ Google, $5/5★ TripAdvisor), and publishes a dashboard.

**Stack:**
- `WeeklyReviewsEngine.gs` — Google Apps Script, runs weekly via time trigger
- `index.html` — Dashboard UI, hosted on Netlify
- Apify — cloud scraping actors for Google Maps and TripAdvisor reviews
- Gmail — primary data storage (JSON emailed weekly as attachment)
- GitHub repo — source of truth, also used for auto-deploy if configured

---

## 2. Repository structure

```
alaskawildlights/akwl-reviews  (branch: claude/rebuild-reviews-dashboard-KX41r)
├── WeeklyReviewsEngine.gs      ← Apps Script (v4.17) — copy this into Apps Script
├── index.html                  ← Dashboard UI — deploy this to Netlify
├── SYSTEM_GUIDE.md             ← Full operational docs
├── ACTIVATION_CHECKLIST.md     ← Step-by-step to-dos
├── PROJECT_SUMMARY_FOR_NEW_CHAT.md  ← This file
├── data.json                   ← Latest weekly data (pushed by script when GitHub token set)
└── akwl-reviews-merged-v2.json ← Old backup JSON (ignore)
```

**IMPORTANT:** The script must be pasted into Google Apps Script manually. It does NOT run from GitHub. GitHub is only for version history and auto-deploy of the dashboard.

---

## 3. Files in detail

### WeeklyReviewsEngine.gs (v4.17)
**Where it lives:** Google Apps Script project linked to the business Google account.  
**What it does:** Runs weekly on Monday 6 AM Alaska time. Scrapes reviews → filters by date → matches to guides → updates Google Sheets → builds JSON → sends email (HTML tables + JSON attachment) → optionally pushes JSON to GitHub.

**Key functions:**
- `runWeeklyReport()` — main entry point, called by weekly trigger
- `buildDashboardJSON()` — assembles the full data.json with history
- `sendWeeklyEmail()` — sends HTML tables (per-guide Google/TA 5★ breakdown) + JSON attachment
- `readLastEmailedJSON()` — reads previous JSON from Gmail to prevent data loss
- `pushToGitHub()` — pushes data.json to repo (only if GITHUB_TOKEN is set)
- `util_AddManualWeek()` — add a week manually without Apify
- `util_GenerateMonthlyBaseline()` — generates ready-to-paste snippet for new month baseline
- `fetchGuideList()` — reads guide names from Google Sheet (Employee Info tab)

**Script Properties that must be set in Apps Script console:**

| Property | Required? | Value |
|---|---|---|
| `APIFY_TOKEN` | YES | Your Apify API token |
| `EMAIL_TO` | optional | Default: `info@alaskawildlights.com` |
| `ALERT_EMAIL` | optional | Default: `awlsaray@gmail.com` (receives error alerts) |
| `GITHUB_TOKEN` | optional | GitHub PAT with repo scope (enables auto-deploy) |
| `GITHUB_OWNER` | optional | Default: `alaskawildlights` |
| `GITHUB_REPO` | optional | Default: `akwl-reviews` |

**Google Sheets linked:**
- Employee Info sheet: `1lhB25hdKfARc6nGjbN9AwYGHQ_bsLRdGkeCuQA7Ow9w` (tab: `current employees`)
- Data sheet: `1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU` (tabs: `Weekly Guide Reviews`, `Weekly Flagged Reviews`)

**Apify actors used:**
- Google Maps: `compass~google-maps-reviews-scraper`
- TripAdvisor: `maxcopell~tripadvisor-reviews`
- Fetches 50 reviews per platform, filters to the current week's date window

### index.html
**Where it lives:** Netlify (hosted as static site). Also in GitHub repo for version history.  
**What it shows:** Full reviews dashboard with YTD stats, monthly performance, weekly charts, guide leaderboard, low-rating reviews, week-over-week comparison.

**Data loading priority:**
1. `./data.json` from GitHub (auto-refreshes when pushed by script)
2. `localStorage` (from manual upload)
3. `DEFAULT_DATA` baked into the HTML (hardcoded baseline, always present)

**Data update workflow (manual, current):**
1. Open weekly email titled `AKWL Weekly Reviews — <week>`
2. Save `akwl-reviews-data.json` attachment
3. Go to Netlify dashboard URL
4. Click `↑ Upload data.json`
5. Click `↓ Download index.html`
6. Drag new index.html to Netlify → deploy

**Data update workflow (automatic, pending setup):**
1. Script runs Monday → pushes data.json to GitHub automatically
2. Netlify auto-deploys → no manual steps

---

## 4. Historical data baked into DEFAULT_DATA

Current baked-in data in `index.html` and `HISTORY_BASELINE_2026` in the script:

**Monthly totals (Jan–Apr 2026 only):**

| Month | Reviews | Avg | Bonus |
|---|---|---|---|
| Jan 2026 | 49 | 4.76★ | $200 |
| Feb 2026 | 66 | 4.47★ | $280 |
| Mar 2026 | 115 | 4.50★ | $460 |
| Apr 2026 | 15 | 3.73★ | $40 |

**Weekly entries (May 2026, hardcoded in both script and dashboard):**

| Week | Reviews | Guides |
|---|---|---|
| May 3–9, 2026 | 6 | Shannon Williams ($30), Dylan Berggren ($15) |
| May 10–16, 2026 | 2 | Jodi Bailey ($10), RIpley Caldwell ($10) |
| May 17–23, 2026 | 4 | Shannon Williams ($20), Sierra Baker ($10) |

**YTD 2026 totals (baked in):**
- 257 total reviews
- 4.48★ combined average
- $980 total bonuses paid
- TripAdvisor: 145 reviews, 4.50★ avg
- Google Maps: 53 reviews, 4.68★ avg
- GetYourGuide: 54 reviews, 4.35★ avg

**Note:** May 24+ will be added by the weekly script runs going forward. The baseline is never overwritten — new weeks are merged ON TOP.

---

## 5. Active guides (16 total)

1. Jessica Verrault
2. Shannon Williams
3. Ryan Stebbins
4. Dylan Berggren
5. Jodi Bailey
6. Tyler Trainor
7. RIpley Caldwell ← note capital I in "RIpley" (typo in original, kept consistent)
8. Milo Pranther
9. Rich Cohen
10. John Kane
11. Sierra Baker
12. Wesley Campbell
13. Sullivan Bogardus
14. Pepper Burrel
15. Greg McDaniel
16. Gina Sliger

**Guide name matching in reviews:**
- Full name match (case-insensitive)
- Last name whole-word match (4+ chars)
- First name whole-word match (4+ chars)
- Alias table in `getGuideAliases()`: `dillion→Dylan Berggren`, `regina→Gina Sliger`, `shannon→Shannon Williams`
- **Pending (not yet implemented):** Fuzzy matching for typos like "Sheena"→Shannon, "Dillon"→Dylan, "Ginna"→Gina

---

## 6. History protection — 3-layer system

The script can NEVER lose history because of this:

```
Layer 1: HISTORY_BASELINE_2026 constant (hardcoded in .gs file)
   - Jan-Apr 2026 monthly totals + May 2026 weekly entries
   - Survives any data loss

Layer 2: Last emailed JSON (Gmail)
   - readLastEmailedJSON() searches Gmail for most recent "AKWL Weekly Reviews" email
   - Pulls akwl-reviews-data.json attachment
   - Recovers any weeks since baseline was set

Layer 3: Current week (freshly scraped)
   - Added on top of layers 1+2

Merge priority: baseline → email JSON → current week
```

---

## 7. Why the v4.15 code "didn't work"

The user uploaded their local v4.15 script and said it failed. The v4.17 code in the repo has ONE functional difference: the **GitHub push block** in `runWeeklyReport()`. Otherwise the weekly email/scrape logic is identical.

**Real reason it likely failed (choose the one that matches the error):**

**Scenario A — APIFY_TOKEN not set or expired:**
- Error in Apps Script log: `"APIFY_TOKEN is not set in Script Properties"`
- Both scrapes fail → both return `[]` → script aborts at: `if (gmapsRaw.length === 0 && taRaw.length === 0)`
- Alert email sent to `awlsaray@gmail.com` with subject `[AKWL Reviews] Weekly run aborted`
- **Fix:** Set `APIFY_TOKEN` in Apps Script → Project Settings → Script Properties

**Scenario B — Apps Script timeout (6 min limit):**
- Apify runs take ~3-5 min per platform. If both run sequentially, that's 6-10 min.
- Apps Script kills the script at 6 min, no email sent
- **Fix:** This is a known limitation. The 6-min timeout is tight. Usually works fine but can fail occasionally. Can't be avoided without Apify async webhooks.

**Scenario C — Ran on Sunday May 31 and got 0 reviews for May 24-30:**
- Script succeeded, email sent, but showed "Sin 5★" (no bonuses, no reviews in that specific week window)
- This is CORRECT behavior if no reviews were published that week
- The dashboard JSON still gets built and emailed with 0-review week entry

**Scenario D — Google Sheets access error:**
- If the Google account running the script doesn't have edit access to the sheets
- Error in `updateWeeklyReviewsTab()` or `updateFlaggedReviewsTab()`
- Script fails before email is sent
- **Fix:** Make sure the Apps Script is running under the same Google account that owns the sheets

**To diagnose:** Open Apps Script → Executions tab → find the most recent `runWeeklyReport` run → click to see the full log.

---

## 8. Pending tasks (what was being worked on)

### Priority 1: GitHub auto-deploy (5 min setup, ready to activate)
The code is already in the script (v4.17). Just needs:
1. Generate GitHub Personal Access Token with `repo` scope: https://github.com/settings/tokens
2. Add to Apps Script Properties: `GITHUB_TOKEN`, `GITHUB_OWNER=alaskawildlights`, `GITHUB_REPO=akwl-reviews`
3. Connect Netlify to GitHub: Netlify dashboard → Site settings → Build & deploy → Link site to Git → select `alaskawildlights/akwl-reviews` → branch `main`
4. Result: every Monday, script pushes data.json → Netlify auto-deploys → everyone sees new data instantly

### Priority 2: TripAdvisor full history
User has 775 TripAdvisor reviews from 2025-01-03 to 2026-05-30 (uploaded as CSV). The business has ~5000+ all-time reviews. Options:
- **Keep 2025-forward only** (current, free — already done)
- **Get all-time history**: Run Apify with NO date filter ($25-50 one-time cost) → download CSV → paste to Claude to process → add to HISTORY_BASELINE_2026

The 775-review breakdown from the CSV:
- 680 of 775 are 5★ (87%)
- Peak months: Mar 2025 (99), Jul 2025 (69), Aug 2025 (64)
- Top mentioned guides: Gina (93), Jessica (54), Shannon (36), Jodi (29), Greg (19)
- Rating distribution: {5: 680, 4: 50, 3: 13, 2: 13, 1: 19}

**To add this data:** The user could paste the CSV content and Claude can process it into the HISTORY_BASELINE_2026.monthly format.

### Priority 3: Fuzzy guide name matching
Reviews sometimes have typos: "Sheena" → Shannon, "Dillon" → Dylan, "Ginna" → Gina.
Current matching is exact (full name, last name, first name). Levenshtein distance algorithm would catch these.
Not urgent — impacts only a few reviews per week. Can be added later.

---

## 9. Data flow (Monday morning, fully automatic when GitHub is configured)

```
Monday 6 AM Alaska time
    ↓
[Apps Script trigger fires runWeeklyReport()]
    ↓
1. Load guide list from Google Sheet (Employee Info tab)
2. getWeekWindow() → previous Sunday-Saturday date range
3. fetchApifyReviews('gmaps') → 50 recent Google Maps reviews
4. fetchApifyReviews('tripadvisor') → 50 recent TripAdvisor reviews
5. filterByDateRange() → keep only reviews in the week window
6. matchReviewsToGuides() → assign each review to guide(s) by name
7. calculateMetrics() → per-guide stats (gmaps★, ta★, bonus)
8. dedupReviews() → remove already-counted reviews (SEEN_REVIEW_IDS)
9. updateWeeklyReviewsTab() → write to Google Sheet
10. updateFlaggedReviewsTab() → write 1-2★ reviews to Sheet
11. buildDashboardJSON() → merge with baseline+email history → full data.json
12. sendWeeklyEmail() → HTML tables (per-guide breakdown) + JSON attachment
13. pushToGitHub() [if GITHUB_TOKEN set] → data.json to repo
14. persistRunningState() → save counters to Script Properties
    ↓
[If GitHub configured]: Netlify webhook fires → deploys new index.html
    ↓
Dashboard updates for all viewers
```

---

## 10. Email format (what arrives in inbox on Monday)

**Subject:** `AKWL Weekly Reviews — May 24 – May 30, 2026`

**HTML body:**
- Google Maps section: table per guide with Reviews | 5★ | Bonus columns
- TripAdvisor section: same
- Total bonus box

**Attachment:** `akwl-reviews-data.json` — complete history up to and including this week

---

## 11. Dashboard sections (top to bottom)

1. **Header** — YTD avg pill + Upload button + last data date
2. **YTD Gauge** — doughnut chart showing progress to 5.0★
3. **KPI cards** — YTD Reviews · This Week · YTD Bonuses Paid
4. **Platforms YTD** — per-platform count, avg, 5★ count
5. **Monthly Performance** — benchmark grid Jan–Dec (target ≥ 4.5★)
6. **Average rating trend** — line chart (Monthly or Weekly toggle, per-platform filter)
7. **Reviews per period** — bar chart (Monthly or Weekly, stacked or grouped)
8. **Week range filter** — From/To dropdowns (appears in Weekly view)
9. **5★ per guide** — bar chart (YTD or This Week)
10. **Guide performance table** — This Week 5★ · Bonus · YTD 5★
11. **Week-over-week comparison** — last 2 weeks side by side with ▲▼ deltas
12. **Low-rating reviews** — 1-2★ this week with guide, platform, text

---

## 12. Common troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Script didn't run Monday | Trigger deleted | Apps Script → Triggers → re-add weekly Monday 6AM trigger |
| Both scrapes return 0 | APIFY_TOKEN expired | Renew token at apify.com, update Script Properties |
| Script timeout | Apify took > 6 min | Re-run manually, usually works on retry |
| Email sent but no data | No reviews in week window | Normal — wait for next week |
| Dashboard not updating | Forgot to deploy | Upload JSON → download index.html → deploy to Netlify |
| Guide "Sheena" unassigned | Typo in review text | Add `'sheena': 'Shannon Williams'` to `getGuideAliases()` |
| Jan-Apr data disappeared | Prior session issue | HISTORY_BASELINE_2026 in script always restores it |

---

## 13. Quick setup checklist for new Apps Script project

If starting fresh (e.g., new Apps Script project):

1. **Paste code**: Copy ALL of `WeeklyReviewsEngine.gs` from the repo into Apps Script
2. **Set properties**: Apps Script → Project Settings → Script properties:
   - `APIFY_TOKEN` = your Apify token
3. **Set trigger**: Apps Script → Triggers → Add Trigger:
   - Function: `runWeeklyReport`
   - Event: Time-driven → Week timer → Monday → 6 AM - 7 AM
4. **Test**: Run `runWeeklyReport()` manually. Check Executions tab for logs. You should get an email at `info@alaskawildlights.com`.
5. **Dashboard**: Deploy `index.html` to Netlify (drag & drop)

---

## 14. Repo commit history (recent)

```
28bf7ea  chore: update script version to v4.17
26ed225  docs: add activation checklist  
b5bb335  docs: update SYSTEM_GUIDE
b3ba058  feat: enable GitHub auto-deploy workflow
55969d2  docs: add system guide
c623710  feat: week range filter + all-English UI
3a36395  feat: bake-and-download button
42e35c6  fix: weekly charts + week-over-week comparison
e2c3f3f  fix: simplify weekly email
```

---

## 15. Next session — what to tell a new Claude

When starting a new session, give Claude this context:

> "I'm working on the AKWL Reviews dashboard for Alaska Wild Lights. The repo is `alaskawildlights/akwl-reviews`, branch `claude/rebuild-reviews-dashboard-KX41r`. The project summary is in `PROJECT_SUMMARY_FOR_NEW_CHAT.md`. I need [your specific task]. The script is `WeeklyReviewsEngine.gs` (v4.17, Google Apps Script) and the dashboard is `index.html` (deployed on Netlify). The main pending items are: (1) GitHub auto-deploy setup, (2) TripAdvisor full history, (3) fuzzy guide name matching."

---

*Summary written: May 31, 2026 · v4.17 · Session: claude/rebuild-reviews-dashboard-KX41r*
