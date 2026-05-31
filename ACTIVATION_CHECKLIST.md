# Alaska Wild Lights Reviews — Activation Checklist

**Current Status:** Dashboard fully functional with email-based workflow. GitHub auto-deploy code ready, awaiting token setup.

**Timeline:** Today is May 31, 2026. Next weekly run: Monday June 2, 6 AM Alaska time.

---

## 🎯 THIS WEEK'S ACTION ITEMS

### ✅ Priority 1: GitHub Auto-Deploy Setup (5 minutes)
Enables fully automatic updates: script → GitHub → Netlify → all devices see new data instantly.

**Step 1.** Generate GitHub token  
→ Go to https://github.com/settings/tokens?type=beta  
→ Click "Generate new token (classic)"  
→ Name: `AKWL Apps Script`  
→ Expiration: 1 year  
→ Scopes: Check **`repo`** only  
→ Click "Generate token" → **Copy it immediately**

**Step 2.** Add to Apps Script Properties  
→ Apps Script console → Project Settings → Script properties → Add property  
→ `GITHUB_TOKEN` = paste the token  
→ Save

**Step 3.** Connect Netlify to GitHub  
→ Netlify Dashboard → your site → Site settings → Build & deploy  
→ Continuous deployment → Link site to Git  
→ Select `alaskawildlights/akwl-reviews` → Branch `main`  
→ Build command: leave empty  
→ Publish directory: `.`  
→ Save

**Result:** Monday 6 AM, the script will auto-push data to GitHub, Netlify redeploys, everyone sees new data. Zero manual steps. ✨

---

### ⏳ Priority 2: TripAdvisor Full History (Optional, higher cost)
Current system has 775 reviews from 2025-01 to present. Full history would include 2024 and earlier.

**Decision needed:**  
- **Option A (Recommended):** Scrape all-time unfiltered  
  - Cost: ~$25–50  
  - Get: ~1000–2000+ total reviews covering full business history  
  
- **Option B (Current approach):** Keep 2025-forward only  
  - Cost: ~$15–25  
  - Keep: Current 775 reviews + new ones going forward

**If you choose Option A:**  
1. Go to Apify → `maxcopell~tripadvisor-reviews` actor  
2. Input: Alaska Wild Lights URL, **no date filter**  
3. Run → download CSV when done  
4. Send CSV to me, I'll integrate into baseline  
5. Update script + dashboard with complete history

---

### 💭 Priority 3: Fuzzy Guide Name Matching (Nice-to-have)
Reviews sometimes mention "Sheena" (→ Shannon), "Dillon" (→ Dylan), "Ginna" (→ Gina).  
Script currently does substring + whole-word matching. Could add Levenshtein distance for typo tolerance.

**Status:** Not critical for Monday's run, can implement after.

---

## 📋 SYSTEM STATUS CHECK

### Email Workflow (Current, Always Works)
- ✅ Monday 6 AM: script scrapes  
- ✅ Script sends HTML tables + JSON attachment  
- ⚠️  Manual: download email attachment  
- ⚠️  Manual: upload to dashboard  
- ⚠️  Manual: download updated index.html  
- ⚠️  Manual: deploy to Netlify  
**Summary:** Full email → manual deploy flow works. Takes ~5 minutes per week.

### GitHub Auto-Deploy (Waiting for Setup)
- ✅ Code ready in Apps Script (lines 793–801)  
- ✅ Code ready in Dashboard (loads from GitHub first)  
- ⏳ Needs: GitHub token (Step 1 above)  
- ⏳ Needs: Netlify connection (Step 3 above)  
**Summary:** Once tokens are set, it all becomes automatic.

### Data Integrity
- ✅ Jan–Apr 2026 hardcoded in script (never lost)  
- ✅ May 2026 (3 weeks) hardcoded + email backup  
- ✅ Email is primary memory; Drive backup removed  
- ✅ Last email JSON recoverable from SEEN_REVIEW_IDS dedup  

### Monday's Weekly Run
- ✅ Trigger configured? Check Apps Script → Triggers  
- ✅ APIFY_TOKEN set? Check Script Properties  
- ✅ EMAIL_TO correct? Should be info@alaskawildlights.com  
- ✅ Guide list current? Check Google Sheet (Employee Info tab, should have 16 guides)

---

## 🔗 QUICK LINKS

| Resource | Link |
|---|---|
| **Apify TripAdvisor Actor** | https://apify.com/maxcopell/tripadvisor-reviews |
| **GitHub Personal Tokens** | https://github.com/settings/tokens?type=beta |
| **Netlify Dashboard** | https://app.netlify.com/ |
| **Apps Script Console** | https://script.google.com/ |
| **System Guide (Full Docs)** | See SYSTEM_GUIDE.md |

---

## 📅 TIMELINE

| Date | Event | Action |
|---|---|---|
| **Today (May 31)** | Baseline ready | Set up GitHub token if desired |
| **Mon Jun 2, 6 AM** | Weekly run | If GitHub token set, full auto-deploy. Otherwise, manual deploy. |
| **Future (June+)** | Ongoing | Repeats every Monday. Full auto if setup complete. |

---

## 💬 QUESTIONS?

- **"Will it break if I don't set up GitHub token?"** No. Current email workflow still works perfectly. GitHub setup is purely optional for automation.
- **"Should I get full TripAdvisor history?"** If you want complete company analytics, yes. If current 2025+ coverage is fine, skip for now.
- **"When should I run the fuzzy matching?"** After the GitHub setup is working smoothly. Not urgent.

---

**Next step:** Choose one of the three priorities above and let's make it happen! 🚀
