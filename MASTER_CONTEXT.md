# AKWL Reviews — Master Context Document
## Everything from first message to last — for a new Claude chat session

**Date written:** May 31, 2026  
**Repo:** `alaskawildlights/akwl-reviews`  
**Branch:** `claude/rebuild-reviews-dashboard-KX41r`  
**Script version:** v4.17  
**Dashboard:** `index.html` (deployed on Netlify)  
**Next weekly run:** Monday June 2, 2026 at 6 AM Alaska time

---

## PART 1 — WHAT EXISTS TODAY (the working system)

### What the system does

Alaska Wild Lights is a northern lights tour company in Fairbanks, AK. Every Monday at 6 AM Alaska time, a Google Apps Script runs automatically and:

1. Scrapes the latest Google Maps + TripAdvisor reviews via Apify
2. Filters to the past week (Sunday–Saturday date window)
3. Matches reviewer text to guide names (Shannon, Dylan, Jodi, etc.)
4. Calculates guide bonuses: $10/5★ Google Maps, $5/5★ TripAdvisor
5. Writes results to two Google Sheets tabs (guide summary + flagged 1-2★ reviews)
6. Builds a full JSON file with all history (baseline + email history + current week)
7. Sends email to info@alaskawildlights.com with HTML tables + JSON attachment
8. If GITHUB_TOKEN is set: pushes data.json to GitHub → Netlify auto-deploys dashboard

### Stack

| Component | What it is | Where it lives |
|---|---|---|
| `WeeklyReviewsEngine.gs` | Google Apps Script | Paste into Apps Script manually |
| `index.html` | Dashboard UI | Deployed on Netlify (static site) |
| Apify | Cloud scraping | apify.com (actors run by script) |
| Gmail | Primary data storage | Weekly JSON attachment kept there |
| Google Sheets | Guide + flagged review logs | Two sheets linked by ID in script |
| GitHub | Version control + auto-deploy source | `alaskawildlights/akwl-reviews` |
| Netlify | Dashboard hosting | Linked to GitHub or manual deploy |

---

## PART 2 — REPOSITORY STRUCTURE

```
alaskawildlights/akwl-reviews  (branch: claude/rebuild-reviews-dashboard-KX41r)
├── WeeklyReviewsEngine.gs      ← Apps Script (v4.17)
├── index.html                  ← Dashboard UI
├── SYSTEM_GUIDE.md             ← Full operational docs
├── ACTIVATION_CHECKLIST.md     ← Step-by-step to-dos
├── PROJECT_SUMMARY_FOR_NEW_CHAT.md  ← Earlier handoff doc
├── MASTER_CONTEXT.md           ← This file (most complete)
├── data.json                   ← Latest weekly data (pushed by script when GitHub token set)
└── akwl-reviews-merged-v2.json ← Old backup JSON (ignore)
```

**IMPORTANT:** The Apps Script does NOT run from GitHub. It must be pasted manually into a Google Apps Script project. GitHub is only for version history and Netlify auto-deploy of the dashboard.

---

## PART 3 — SCRIPT: WeeklyReviewsEngine.gs (v4.17)

### Script Properties that MUST be set in Apps Script console

| Property | Required? | Value |
|---|---|---|
| `APIFY_TOKEN` | YES | Your Apify API token (set in Apps Script Properties, never in code) |
| `EMAIL_TO` | optional | Default: `info@alaskawildlights.com` |
| `ALERT_EMAIL` | optional | Default: `awlsaray@gmail.com` (receives error alerts) |
| `GITHUB_TOKEN` | optional | GitHub PAT with repo scope (enables auto-deploy) |
| `GITHUB_OWNER` | optional | Default: `alaskawildlights` |
| `GITHUB_REPO` | optional | Default: `akwl-reviews` |

### Key functions

- `runWeeklyReport()` — main entry point, called by the weekly trigger
- `buildDashboardJSON()` — assembles the full data.json with all history
- `sendWeeklyEmail()` — sends HTML tables (per-guide breakdown) + JSON attachment
- `readLastEmailedJSON()` — recovers history from Gmail if other layers fail
- `pushToGitHub()` — pushes data.json to repo (only if GITHUB_TOKEN is set)
- `util_AddManualWeek()` — adds a week manually without running Apify
- `util_GenerateMonthlyBaseline()` — generates ready-to-paste snippet for new month
- `fetchGuideList()` — reads guide names from Google Sheet (Employee Info tab)
- `getGuideAliases()` — alias table for name variations in reviews
- `computeRunningState()` — computes YTD totals from bootstrap + current week
- `rebuildHistoryAggregates()` — rebuilds monthly and byGuide from weekly entries

### Google Sheets linked

- Employee Info sheet: `1lhB25hdKfARc6nGjbN9AwYGHQ_bsLRdGkeCuQA7Ow9w` (tab: `current employees`)
- Data sheet: `1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU` (tabs: `Weekly Guide Reviews`, `Weekly Flagged Reviews`)

### Apify actors

- Google Maps: `compass~google-maps-reviews-scraper`
- TripAdvisor: `maxcopell~tripadvisor-reviews`
- Fetches 50 reviews per platform, filters to the current week's date window

### History protection — 3 layers

```
Layer 1: HISTORY_BASELINE_2026 (hardcoded in .gs)
   Jan-Apr 2026 monthly totals + all May 2026 weekly entries
   Survives any data loss — never overwritten

Layer 2: Last emailed JSON (Gmail)
   readLastEmailedJSON() finds most recent "AKWL Weekly Reviews" email
   Pulls akwl-reviews-data.json attachment
   Recovers weeks since baseline was set

Layer 3: Current week (freshly scraped)
   Added on top of layers 1+2

Merge priority: baseline → email JSON → current week
```

---

## PART 4 — DASHBOARD: index.html

### How data loads

1. Tries to fetch `./data.json` from GitHub (auto-refreshes when script pushes)
2. Falls back to `localStorage` (from manual JSON upload)
3. Falls back to `DEFAULT_DATA` baked between `@@BAKED_DATA_START@@` and `@@BAKED_DATA_END@@` markers

### Current baked data (as of May 31, 2026)

**YTD 2026:**
- 267 total reviews
- 4.49★ combined average  
- $1,045 total bonuses paid
- TripAdvisor: 147 reviews, 4.51★ avg, 112 five-star
- Google Maps: 61 reviews, 4.66★ avg, 50 five-star
- GetYourGuide: 54 reviews, 4.35★ avg (historical, no longer scraped)

**Monthly totals (Jan–Apr 2026, hardcoded baseline):**

| Month | Reviews | Avg | Bonus |
|---|---|---|---|
| Jan 2026 | 49 | 4.76★ | $200 |
| Feb 2026 | 66 | 4.47★ | $280 |
| Mar 2026 | 115 | 4.50★ | $460 |
| Apr 2026 | 15 | 3.73★ | $40 |

**May 2026 weekly entries (all baked in):**

| Week | Reviews | Guides credited |
|---|---|---|
| May 3–9, 2026 | 6 | Shannon Williams ($30), Dylan Berggren ($15) |
| May 10–16, 2026 | 2 | Jodi Bailey ($10), RIpley Caldwell ($10) |
| May 17–23, 2026 | 4 | Shannon Williams ($20), Sierra Baker ($10) |
| May 24–30, 2026 | 10 | Shannon Williams ($30), Pepper Burrel ($15), Dylan Berggren ($10), Jodi Bailey ($10) |

**May 24–30 review detail (manually entered this session):**
- TripAdvisor:
  - ccistar4ever (May 28, 5★) → Pepper Burrel
  - Nomad05333893722 (May 30, 5★) → UNASSIGNED (no guide mentioned)
- Google Maps:
  - Gina Lombardini (5★) → Pepper Burrel
  - Komal Thakkar (5★) → UNASSIGNED (no text mentioning a guide)
  - Rick Coleman (5★) → Shannon Williams ("Sheena" = Shannon per owner response in review)
  - Kellee Solt (5★) → Dylan Berggren ("Dillon" = Dylan via alias)
  - Jeanine R (5★) → Shannon Williams
  - Ian Kennedy (5★) → Shannon Williams
  - Elaine Figueroa (5★) → Jodi Bailey
  - Ana (1★) → UNASSIGNED, flagged as low-rating review

### Manual update workflow (current)

1. Open weekly email titled `AKWL Weekly Reviews — <week>`
2. Save `akwl-reviews-data.json` attachment
3. Go to Netlify dashboard URL
4. Click `Upload data.json`
5. Click `Download index.html`
6. Drag new index.html to Netlify → deploy

### Automatic update workflow (pending GitHub token setup)

1. Script runs Monday → pushes data.json to GitHub automatically
2. Netlify auto-deploys → no manual steps

---

## PART 5 — ACTIVE GUIDES (16 total)

1. Jessica Verrault
2. Shannon Williams
3. Ryan Stebbins
4. Dylan Berggren
5. Jodi Bailey
6. Tyler Trainor
7. RIpley Caldwell ← note capital I (typo in original data, kept consistent everywhere)
8. Milo Pranther
9. Rich Cohen
10. John Kane
11. Sierra Baker
12. Wesley Campbell
13. Sullivan Bogardus
14. Pepper Burrel
15. Greg McDaniel
16. Gina Sliger

### Guide name matching rules (current)

1. Full name match (case-insensitive): "Shannon Williams"
2. Last name whole-word match (4+ chars): "Williams"
3. First name whole-word match (4+ chars): "Shannon"
4. Alias table in `getGuideAliases()`:
   - `dillion` → Dylan Berggren
   - `dillon` → Dylan Berggren
   - `sheena` → Shannon Williams
   - `shannon` → Shannon Williams
   - `regina` → Gina Sliger

---

## PART 6 — WHY V4.15 FAILED (the diagnosis)

The owner ran their local v4.15 script and it didn't produce results. The v4.17 in the repo has ONE functional difference: the GitHub push block. The scraping/email logic is identical in both versions.

**Most likely causes:**

| Scenario | Error | Fix |
|---|---|---|
| APIFY_TOKEN not set | Log: "APIFY_TOKEN is not set in Script Properties" | Set it in Apps Script → Project Settings → Script properties |
| Apps Script timeout | Script killed at 6-min limit (Apify can take 3-5 min each) | Re-run manually, usually succeeds on retry |
| 0 reviews for that week | Script ran fine, email sent, but no reviews in date window | Normal behavior — no action needed |
| Google Sheets access | Error in updateWeeklyReviewsTab() | Run script under account that owns the sheets |

**To diagnose:** Apps Script → Executions tab → find `runWeeklyReport` → click to see full log.

---

## PART 7 — PENDING TASKS

### Priority 1: GitHub Auto-Deploy (5 min, code is ready)

The code is already in v4.17. Just needs:

**Step 1.** Generate GitHub token  
→ https://github.com/settings/tokens → Generate new token (classic)  
→ Name: `AKWL Apps Script` · Expiration: 1 year · Scope: `repo` only  
→ Copy immediately

**Step 2.** Add to Apps Script Properties  
→ Apps Script → Project Settings → Script properties  
→ `GITHUB_TOKEN` = paste the token  
→ Also confirm: `GITHUB_OWNER=alaskawildlights`, `GITHUB_REPO=akwl-reviews`

**Step 3.** Connect Netlify to GitHub  
→ Netlify Dashboard → your site → Site settings → Build & deploy  
→ Continuous deployment → Link site to Git  
→ Select `alaskawildlights/akwl-reviews` → Branch: `claude/rebuild-reviews-dashboard-KX41r` (or `main` if merged)  
→ Build command: leave empty · Publish directory: `.`  
→ Save

**Result:** Every Monday, the script auto-pushes → Netlify redeploys → everyone sees new data instantly.

### Priority 2: TripAdvisor Full History (optional, $25-50)

Current system has 775 reviews from 2025-01 onward. Full all-time history would add 2024 and earlier.

**Option A (recommended if you want complete analytics):**
1. Go to Apify → `maxcopell~tripadvisor-reviews` actor
2. Input: Alaska Wild Lights TripAdvisor URL, NO date filter
3. Run → download CSV when done (~$25-50)
4. Paste CSV to Claude → Claude processes into HISTORY_BASELINE_2026 monthly format
5. Update both script and dashboard with complete history

**Option B (current):** Keep 2025-forward only, no additional cost.

**2025 TripAdvisor data already processed (775 reviews):**
- 680 of 775 are 5★ (87%)
- Peak months: Mar 2025 (99 reviews), Jul 2025 (69), Aug 2025 (64)
- Top mentioned guides: Gina (93), Jessica (54), Shannon (36), Jodi (29), Greg (19)
- Rating distribution: {5: 680, 4: 50, 3: 13, 2: 13, 1: 19}

### Priority 3: Fuzzy Guide Name Matching (nice-to-have)

Reviews sometimes have typos: "Sheena" → Shannon, "Dillon" → Dylan, "Ginna" → Gina.

Current matching: exact full name, last name (4+ chars), first name (4+ chars), alias table.
Missing: Levenshtein distance for catching typos not in the alias table.

**Implementation approach:** Add `levenshteinMatch(name, guides)` function in the script. Compare each word in review text against all guide names. If Levenshtein distance ≤ 2, consider it a match. Already have the alias table as a fast pre-check.

Not critical — impacts only a few reviews per week.

---

## PART 8 — THE NEW PROJECT: REVIEWS TRACKER RECONSTRUCTION

### Background

The owner has platforms beyond Google Maps and TripAdvisor that the current automated system doesn't cover:

- **GetYourGuide** — currently only has historical data (54 reviews at 4.35★)
- **Civitatis** — not tracked at all
- **Expedia** — not tracked at all
- **Atmos Rewards** — not tracked at all
- **Booking.com** — not tracked at all

Apify can potentially scrape some of these, but the APIs vary. The owner wants a system where data from ALL platforms can be tracked, even if some require manual entry.

### The vision

Rebuild or extend the Google Sheet to serve as a **Reviews Tracker** that:

1. Accepts manual entry for platforms that can't be auto-scraped
2. Keeps per-platform breakdown with consistent structure
3. Integrates with the weekly automation (script reads from the sheet, not just Apify)
4. Shows complete picture: Google + TripAdvisor (auto) + GetYourGuide + Civitatis + Expedia + Atmos + Booking (manual entry)
5. Feeds into the same dashboard JSON format for consistent display

### Proposed architecture

**Option A: Extend existing Google Sheet**
- Add new tabs per platform (GetYourGuide, Civitatis, etc.)
- Each tab: Date, Reviewer, Rating, Review text, Guide mentioned, Bonus eligible (Y/N)
- Script reads all tabs, merges with Apify data
- Simple, no new infrastructure

**Option B: New dedicated Reviews Tracker sheet**
- Separate Google Sheet specifically for manual platform tracking
- Master tab with consolidated view
- Individual platform tabs for raw entry
- The weekly script imports from this sheet

**Option C: Hybrid — keep Apify for Google+TA, add manual entry for others**
- Current system unchanged (Google Maps + TripAdvisor auto-scraped)
- New Google Sheet tab: `Manual Reviews` with columns: Date | Platform | Rating | ReviewText | GuideMatch | Bonus
- Script reads this tab weekly, merges into JSON alongside Apify results
- Owner or manager enters new reviews from other platforms into this tab each week

**Recommendation:** Option C. Least disruption to the working system. Manual platforms only need a few entries per week. The script already reads from Google Sheets.

### What needs to be built

1. **New Google Sheet tab** (in existing data sheet or new sheet):
   - Columns: `Date`, `Platform`, `Rating`, `ReviewText`, `GuideMatch`, `Bonus`, `WeekLabel`, `Counted`
   - Platform dropdown: GetYourGuide, Civitatis, Expedia, Atmos, Booking, Other
   - GuideMatch auto-suggests from guide list (can be done with data validation)
   - `Counted` checkbox — once checked, script won't recount it

2. **Script changes** (new function in WeeklyReviewsEngine.gs):
   - `fetchManualReviews(weekStart, weekEnd)` — reads Manual Reviews tab for the week
   - Merges manual reviews with Apify reviews before guide matching
   - Marks manual reviews as counted (sets Counted = true)
   - Handles bonus calculation same as auto reviews

3. **Dashboard changes** (index.html):
   - Extend per-platform display to show all platforms (currently only shows Google + TripAdvisor + GetYourGuide)
   - Add Civitatis, Expedia, Atmos, Booking to platform cards
   - Show "Manual entry" badge on those platform cards

### Timeline estimate

- Step 1 (Google Sheet tab setup): 30 min
- Step 2 (script function): 2 hours with Claude
- Step 3 (dashboard update): 1 hour with Claude
- Total: half a day, done in one Claude session

---

## PART 9 — DATA FLOW (complete picture)

```
Monday 6 AM Alaska time
    ↓
[Apps Script trigger fires runWeeklyReport()]
    ↓
1.  Load guide list from Google Sheet (Employee Info tab)
2.  getWeekWindow() → previous Sunday-Saturday date range
3.  fetchApifyReviews('gmaps') → 50 recent Google Maps reviews
4.  fetchApifyReviews('tripadvisor') → 50 recent TripAdvisor reviews
5.  [FUTURE] fetchManualReviews(start, end) → reads Manual Reviews tab
6.  filterByDateRange() → keep only reviews in the week window
7.  matchReviewsToGuides() → assign each review to guide(s) by name
8.  calculateMetrics() → per-guide stats (gmaps★, ta★, bonus)
9.  dedupReviews() → remove already-counted reviews (SEEN_REVIEW_IDS)
10. updateWeeklyReviewsTab() → write to Google Sheet
11. updateFlaggedReviewsTab() → write 1-2★ reviews to Sheet
12. buildDashboardJSON() → merge with baseline+email history → full data.json
13. sendWeeklyEmail() → HTML tables (per-guide breakdown) + JSON attachment
14. pushToGitHub() [if GITHUB_TOKEN set] → data.json to repo
15. persistRunningState() → save counters to Script Properties
    ↓
[If GitHub configured]: Netlify webhook fires → deploys new index.html
    ↓
Dashboard updates for all viewers
```

---

## PART 10 — EMAIL FORMAT

**Subject:** `AKWL Weekly Reviews — May 25 – May 31, 2026`

**HTML body:**
- Google Maps section: table per guide — Reviews | 5★ | Bonus columns
- TripAdvisor section: same
- Total bonus box

**Attachment:** `akwl-reviews-data.json` — complete history up to and including this week

---

## PART 11 — DASHBOARD SECTIONS (top to bottom)

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
11. **Week-over-week comparison** — last 2 weeks side by side with deltas
12. **Low-rating reviews** — 1-2★ this week with guide, platform, text

---

## PART 12 — TROUBLESHOOTING

| Problem | Cause | Fix |
|---|---|---|
| Script didn't run Monday | Trigger deleted | Apps Script → Triggers → re-add weekly Monday 6AM trigger |
| Both scrapes return 0 | APIFY_TOKEN expired | Renew token at apify.com, update Script Properties |
| Script timeout | Apify took > 6 min | Re-run manually, usually works on retry |
| Email sent but no data | No reviews in week window | Normal — wait for next week |
| Dashboard not updating | Forgot to deploy | Upload JSON → download index.html → deploy to Netlify |
| Guide "Sheena" unassigned | Typo in review text | Add `'sheena': 'Shannon Williams'` to `getGuideAliases()` |
| Jan-Apr data disappeared | Any kind of data loss | HISTORY_BASELINE_2026 in script always restores it |
| Monthly fiveStar shows 0 | Bug in rebuildHistoryAggregates | Fixed in v4.17 — make sure you're running that version |

---

## PART 13 — WHAT TO SAY TO START A NEW CLAUDE SESSION

Copy and paste this:

> "I'm working on the AKWL Reviews dashboard for Alaska Wild Lights (northern lights tours, Fairbanks AK). Repo: `alaskawildlights/akwl-reviews`, branch `claude/rebuild-reviews-dashboard-KX41r`. Full context is in `MASTER_CONTEXT.md` in the repo. The system is: Google Apps Script (`WeeklyReviewsEngine.gs` v4.17) that scrapes reviews weekly + publishes a dashboard (`index.html` on Netlify). Today's date: [DATE]. The data is current through May 30, 2026 (267 reviews, 4.49★ YTD, $1,045 bonuses). I need [your specific task]. The main pending items are: (1) GitHub auto-deploy setup — 5 min, code is ready, just needs GITHUB_TOKEN in Script Properties + Netlify linked to GitHub; (2) Reviews Tracker reconstruction — add manual entry for non-Apify platforms (GetYourGuide, Civitatis, Expedia, Atmos, Booking); (3) TripAdvisor full history (optional, ~$25-50 Apify run); (4) Fuzzy guide name matching."

---

## PART 14 — RECENT COMMIT HISTORY

```
8576d3a  feat: add May 24–30 2026 weekly data (9 reviews, $65 bonus)
733978b  feat: add May 24-30 week + May monthly fix + history byGuide corrections
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

*Written: May 31, 2026 · v4.17 · All data current through week of May 24–30, 2026 (10 reviews: 8 Google + 2 TripAdvisor)*
