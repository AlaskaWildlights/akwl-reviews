// ============================================================
// ALASKA WILD LIGHTS — Weekly Reviews Engine v4.12
//
// v4.12 — NETLIFY DASHBOARD + EMAIL ATTACHMENT WORKFLOW
//   - buildDashboardJSON: builds the full data.json with accumulated
//     history (monthly + weekly + byGuide). Reads previous state from
//     Drive, updates incrementally, writes back.
//   - writeDashboardDataToDrive / readDashboardDataFromDrive: persistent
//     state in Google Drive (file ID stored in Script Properties).
//   - emailDashboardJSON: emails data.json as attachment to ALERT_EMAIL.
//     User saves attachment → uploads via dashboard's Upload button.
//   - Dashboard (index.html on Netlify) uses localStorage to remember
//     uploaded data across visits.
//   - GitHub push of legacy data.json kept as backup but non-fatal.
//   - getActiveGuides: 16-guide allowlist drives dashboard filtering.
//
// v4.11.x history retained below for context.
//
// v4.11 features:
//   1. Email HTML with plain-text fallback
//   2. Debug logging detallado
//   3. Date window verification
//
// v4.11.1 BUG FIXES:
//  FIX 1: First-name matching + miss-logging
//  FIX 2: Plain-text fallback in Gmail draft
//  FIX 3: Added averageRating/totalReviews aliases under allTime
//  FIX 4: Bootstrap idempotency guard
//  FIX 5: getWeekWindow daysBack = dow + 7 (works any day of the week)
//  FIX 6: Multi-guide attribution per review
//
// v4.11.2 HARDENING:
//  - Review-key dedup across runs (SEEN_REVIEW_IDS rolling cache)
//  - Running state and seen-keys are persisted LAST so partial failures don't
//    advance the cumulative totals
//  - try/catch around each Apify platform; failure email to ALERT_EMAIL
//  - fetchWithRetry: 3 attempts, 2s/4s/8s backoff on Apify + GitHub fetches
//  - Single TZ constant
//  - LockService prevents concurrent execution
// ============================================================

// Single source of truth for timezone. Day boundaries are at 00:00 in this tz.
var TZ = 'America/Anchorage';

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    // Secrets live in Script Properties only — set APIFY_TOKEN and GITHUB_TOKEN
    // via PropertiesService.getScriptProperties().setProperty(...) before running.
    APIFY_TOKEN:     props.getProperty('APIFY_TOKEN')     || '',
    GITHUB_TOKEN:    props.getProperty('GITHUB_TOKEN')    || '',
    GITHUB_USERNAME: props.getProperty('GITHUB_USERNAME') || 'AlaskaWildlights',
    GITHUB_REPO:     props.getProperty('GITHUB_REPO')     || 'akwl-reviews',
    GITHUB_BRANCH:   props.getProperty('GITHUB_BRANCH')   || 'main',
    GITHUB_FILE:     props.getProperty('GITHUB_FILE')     || 'data.json',
    EMAIL_TO:        props.getProperty('EMAIL_TO')        || 'info@alaskawildlights.com',
    EMAIL_CC:        props.getProperty('EMAIL_CC')        || 'joshuamcneal@alaskawildlights.com,ashley@alaskawildlights.com,kyle@alaskawildlights.com',
    ALERT_EMAIL:     props.getProperty('ALERT_EMAIL')     || 'awlsaray@gmail.com',
    EMPLOYEE_SHEET_ID: '1lhB25hdKfARc6nGjbN9AwYGHQ_bsLRdGkeCuQA7Ow9w',
    EMPLOYEES_TAB:     'current employees',
    DATA_SHEET_ID:     '1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU',
    REVIEWS_TAB:       'Weekly Guide Reviews',
    FLAGGED_TAB:       'Weekly Flagged Reviews',
    GMAPS_URL: 'https://www.google.com/maps/place/Alaska+Wild+Lights/@64.8108581,-147.7021919,17z/data=!4m18!1m9!3m8!1s0x5133b2ea9da03823:0x2eb3eeb2ebb1dd22!2sAlaska+Wild+Lights!8m2!3d64.8108674!4d-147.7031564!9m1!1b1!16s%2Fg%2F11f_j7gq5t!3m7!1s0x5133b2ea9da03823:0x2eb3eeb2ebb1dd22!8m2!3d64.8108674!4d-147.7031564!9m1!1b1!16s%2Fg%2F11f_j7gq5t?entry=ttu&g_ep=EgoyMDI2MDQxMi4wIKXMDSoASAFQAw%3D%3D',
    TA_URL:    'https://www.tripadvisor.com/Attraction_Review-g31079-d3559823-Reviews-Alaska_Wild_Lights-North_Pole_Alaska.html',
    WEEKLY_REVIEWS_URL:  'https://docs.google.com/spreadsheets/d/1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU/edit?gid=2078759448#gid=2078759448',
    FLAGGED_REVIEWS_URL: 'https://docs.google.com/spreadsheets/d/1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU/edit?gid=1421445550#gid=1421445550',
    EMPLOYEE_INFO_URL:   'https://docs.google.com/spreadsheets/d/1lhB25hdKfARc6nGjbN9AwYGHQ_bsLRdGkeCuQA7Ow9w/edit?gid=0#gid=0'
  };
}

function getGuideAliases() {
  return {
    'dillion': 'Dylan Berggren',
    'regina': 'Gina Sliger',
    'shannon': 'Shannon Williams'
  };
}

// ============================================================
// HELPERS — retries, alerts, review-key dedup
// ============================================================

// Retries UrlFetchApp.fetch up to maxAttempts (default 3) with exponential
// backoff (2s, 4s, 8s). Retries on thrown exceptions and on HTTP 5xx. Returns
// the HTTPResponse from the final attempt. Throws if all attempts fail.
function fetchWithRetry(url, options, maxAttempts) {
  maxAttempts = maxAttempts || 3;
  var lastErr;
  for (var i = 0; i < maxAttempts; i++) {
    try {
      var resp = UrlFetchApp.fetch(url, options || {});
      var code = resp.getResponseCode();
      if (code < 500) return resp;        // 2xx/3xx/4xx are final
      lastErr = new Error('HTTP ' + code + ' from ' + url);
    } catch (e) {
      lastErr = e;
    }
    if (i < maxAttempts - 1) Utilities.sleep(Math.pow(2, i + 1) * 1000);
  }
  throw lastErr || new Error('fetchWithRetry: all attempts failed for ' + url);
}

// Sends a failure alert. Swallows any send error so the script can continue.
function notifyFailure(C, subject, body) {
  try {
    MailApp.sendEmail({
      to: C.ALERT_EMAIL,
      subject: '[AKWL Reviews] ' + subject,
      body: body
    });
    Logger.log('   ✉  Alert sent to ' + C.ALERT_EMAIL);
  } catch (e) {
    Logger.log('   ⚠  Could not send alert email: ' + e.message);
  }
}

// Stable per-review key for dedup across runs.
function reviewKey(r) {
  var platform = r._platform || 'unk';
  var id = r.reviewId || r.id || r.reviewerUrl || r.url || '';
  if (!id) {
    var date = r.publishedAtDate || r.publishedDate || r.date || r.reviewDate || r.time || '';
    var snippet = (r.text || r.reviewText || '').substring(0, 50);
    id = date + ':' + snippet;
  }
  return platform + ':' + id;
}

function getSeenReviewKeys() {
  var json = PropertiesService.getScriptProperties().getProperty('SEEN_REVIEW_IDS') || '[]';
  try { return JSON.parse(json); } catch (e) { return []; }
}

function saveSeenReviewKeys(keysArray) {
  // Cap at last 1000 keys to stay under the 9 KB per-property limit.
  var capped = keysArray.slice(-1000);
  PropertiesService.getScriptProperties().setProperty('SEEN_REVIEW_IDS', JSON.stringify(capped));
}

// Returns only reviews whose key is not in seenSet. Mutates seenSet to mark
// newly-seen keys, so callers can pass the same set across multiple platforms.
function dedupReviews(reviews, seenSet) {
  var fresh = [];
  reviews.forEach(function(r) {
    var k = reviewKey(r);
    if (!seenSet[k]) {
      fresh.push(r);
      seenSet[k] = true;
    }
  });
  return fresh;
}

// ============================================================
// BOOTSTRAP FUNCTION (RUN ONCE)
// ============================================================
function bootstrap_Initialize6MonthHistory() {
  Logger.log('');
  Logger.log('╔════════════════════════════════════════════╗');
  Logger.log('║   BOOTSTRAP: Initialize 6-Month History   ║');
  Logger.log('╚════════════════════════════════════════════╝');
  Logger.log('');

  // FIX 4: Idempotency guard. Re-running this duplicates counts because
  // computeRunningState sums on top of the persisted bootstrap totals.
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('BOOTSTRAP_COMPLETED') === 'true') {
    Logger.log('⚠️  Bootstrap already completed. Delete BOOTSTRAP_COMPLETED property to re-run.');
    return;
  }

  var C = getConfig();

  Logger.log('📡 Fetching 100 Google Maps reviews...');
  var gmapsAll = fetchApifyReviews('gmaps', C, 100);
  Logger.log('   ✓ Google Maps: ' + gmapsAll.length + ' reviews');

  Logger.log('📡 Fetching 100 TripAdvisor reviews...');
  var taAll = fetchApifyReviews('tripadvisor', C, 100);
  Logger.log('   ✓ TripAdvisor: ' + taAll.length + ' reviews');
  Logger.log('');

  var gmapsCount = 0;
  var gmapsStars = 0;
  gmapsAll.forEach(function(r) {
    var rating = parseInt(r.stars||r.rating||0);
    if (rating > 0) { gmapsCount++; gmapsStars += rating; }
  });

  var taCount = 0;
  var taStars = 0;
  taAll.forEach(function(r) {
    var rating = parseInt(r.rating||r.bubbleRating||0);
    if (rating > 0) { taCount++; taStars += rating; }
  });

  props.setProperty('BOOTSTRAP_GMAPS_COUNT', gmapsCount.toString());
  props.setProperty('BOOTSTRAP_GMAPS_STARS', gmapsStars.toString());
  props.setProperty('BOOTSTRAP_TA_COUNT', taCount.toString());
  props.setProperty('BOOTSTRAP_TA_STARS', taStars.toString());
  props.setProperty('BOOTSTRAP_COMPLETED', 'true');

  // Seed SEEN_REVIEW_IDS so the first weekly run won't re-count any of these.
  var seedKeys = [];
  gmapsAll.forEach(function(r) { seedKeys.push(reviewKey(r)); });
  taAll.forEach(function(r)    { seedKeys.push(reviewKey(r)); });
  saveSeenReviewKeys(seedKeys);

  Logger.log('💾 Saved Bootstrap:');
  Logger.log('   Google Maps: ' + gmapsCount + ' reviews, ' + gmapsStars + ' stars');
  Logger.log('   TripAdvisor: ' + taCount + ' reviews, ' + taStars + ' stars');
  Logger.log('   Seeded SEEN_REVIEW_IDS with ' + seedKeys.length + ' keys');
  Logger.log('');
  Logger.log('✅ Bootstrap complete.');
}

// Run once to seed the Drive file from data.json in the GitHub repo.
// This preserves Jan–Apr history when the weekly script runs for the first time.
// Safe to skip if the Drive file already exists.
function bootstrap_SeedDriveFromDataJson() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('DRIVE_FILE_ID')) {
    Logger.log('⚠️  DRIVE_FILE_ID already set — Drive file exists. Skipping seed to avoid overwriting live data.');
    Logger.log('   Delete DRIVE_FILE_ID from Script Properties first if you want to re-seed.');
    return;
  }
  var C = getConfig();
  var url = 'https://raw.githubusercontent.com/' + C.GITHUB_USERNAME + '/' + C.GITHUB_REPO + '/main/data.json';
  Logger.log('📡 Fetching data.json from GitHub...');
  var resp = fetchWithRetry(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    Logger.log('✗ Could not fetch data.json: HTTP ' + resp.getResponseCode());
    return;
  }
  var initialData = JSON.parse(resp.getContentText());
  Logger.log('   ✓ Loaded data.json (' + (initialData.history && initialData.history.monthly ? initialData.history.monthly.length : 0) + ' monthly entries)');
  writeDashboardDataToDrive(JSON.stringify(initialData, null, 2));
  Logger.log('✅ Drive seeded with initial data.json. Run runWeeklyReport normally from here.');
}

// Run once to backfill all of May 2026 into the Drive file. Scrapes ~100
// reviews per platform via Apify, filters to May 2026, buckets by Sun–Sat
// week, and adds each completed week as a weekly entry. Then rebuilds
// monthly + byGuide. Safe to re-run — weekly entries are deduped by label.
// REQUIRES bootstrap_SeedDriveFromDataJson to have run first (so Jan–Apr
// historical data is in Drive and won't be lost).
function bootstrap_SeedMonthlyMay2026() {
  var C = getConfig();
  Logger.log('');
  Logger.log('╔════════════════════════════════════════════╗');
  Logger.log('║   BOOTSTRAP: Seed May 2026 from Apify     ║');
  Logger.log('╚════════════════════════════════════════════╝');
  Logger.log('');

  var prior = readDashboardDataFromDrive();
  if (!prior) {
    Logger.log('✗ No Drive file found. Run bootstrap_SeedDriveFromDataJson() first.');
    return;
  }

  Logger.log('👥 Loading guides...');
  var guides = fetchGuideList(C);
  Logger.log('   ✓ ' + guides.length + ' guides');

  Logger.log('📡 Fetching reviews from Apify (100 per platform)...');
  var gmapsAll = fetchApifyReviews('gmaps', C, 100);
  Logger.log('   ✓ Google Maps: ' + gmapsAll.length);
  var taAll = fetchApifyReviews('tripadvisor', C, 100);
  Logger.log('   ✓ TripAdvisor: ' + taAll.length);

  // Filter to May 2026
  function getDateStr(r) {
    var raw = r.publishedAtDate || r.publishedDate || r.date || r.reviewDate || r.time;
    if (!raw) return null;
    var d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }
  function inMay2026(r) {
    var s = getDateStr(r);
    return s && s >= '2026-05-01' && s <= '2026-05-31';
  }
  var gmapsMay = gmapsAll.filter(inMay2026);
  var taMay = taAll.filter(inMay2026);
  Logger.log('🔍 May 2026 filter: ' + gmapsMay.length + ' GMaps, ' + taMay.length + ' TA');

  // Group by Sunday-start week
  function weekStartFor(dateStr) {
    var parts = dateStr.split('-');
    var d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])));
    var dow = d.getUTCDay(); // 0=Sun
    d.setUTCDate(d.getUTCDate() - dow);
    var mo = ('0'+(d.getUTCMonth()+1)).slice(-2);
    var dy = ('0'+d.getUTCDate()).slice(-2);
    return d.getUTCFullYear() + '-' + mo + '-' + dy;
  }
  function addDays(dateStr, n) {
    var parts = dateStr.split('-');
    var d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])));
    d.setUTCDate(d.getUTCDate() + n);
    var mo = ('0'+(d.getUTCMonth()+1)).slice(-2);
    var dy = ('0'+d.getUTCDate()).slice(-2);
    return d.getUTCFullYear() + '-' + mo + '-' + dy;
  }
  function makeLabel(start, end) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var sp = start.split('-'), ep = end.split('-');
    return months[parseInt(sp[1])-1]+' '+parseInt(sp[2])+' – '+months[parseInt(ep[1])-1]+' '+parseInt(ep[2])+', '+ep[0];
  }

  gmapsMay.forEach(function(r) { r._platform = 'gmaps'; });
  taMay.forEach(function(r) { r._platform = 'tripadvisor'; });

  var weeks = {};
  function bucket(r) {
    var ds = getDateStr(r);
    if (!ds) return;
    var ws = weekStartFor(ds);
    if (!weeks[ws]) weeks[ws] = { gmaps: [], ta: [] };
    if (r._platform === 'gmaps') weeks[ws].gmaps.push(r);
    else weeks[ws].ta.push(r);
  }
  gmapsMay.forEach(bucket);
  taMay.forEach(bucket);

  // Only keep completed weeks (Sun–Sat fully in the past)
  var todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  prior.history = prior.history || { monthly: [], weekly: [], byGuide: [] };
  prior.history.weekly = prior.history.weekly || [];

  Object.keys(weeks).sort().forEach(function(ws) {
    var we = addDays(ws, 6);
    if (we >= todayStr) {
      Logger.log('   Skipping in-progress week ' + ws + ' – ' + we);
      return;
    }
    var label = makeLabel(ws, we);
    var b = weeks[ws];
    var allReviews = b.gmaps.concat(b.ta);
    var matched = matchReviewsToGuides(allReviews, guides);
    var metrics = calculateMetrics(matched, guides, b.gmaps, b.ta);

    var weeklyEntry = {
      weekLabel: label,
      startDate: ws,
      endDate: we,
      timestamp: new Date().toISOString(),
      platforms: {
        googleMaps:  { count: metrics.gmapsCount, avg: parseFloat(metrics.gmapsAvg) || 0, fiveStar: 0 },
        tripAdvisor: { count: metrics.taCount,    avg: parseFloat(metrics.taAvg)    || 0, fiveStar: 0 }
      },
      totalReviews: metrics.combinedCount,
      totalBonus: metrics.totalBonus,
      guides: metrics.guideStats.filter(function(g) { return g.name !== 'UNASSIGNED'; })
    };
    var wIdx = prior.history.weekly.findIndex(function(w) { return w.weekLabel === label; });
    if (wIdx >= 0) prior.history.weekly[wIdx] = weeklyEntry;
    else prior.history.weekly.push(weeklyEntry);
    Logger.log('   Week ' + label + ': ' + metrics.gmapsCount + ' GMaps (' + metrics.gmapsAvg + '★), ' + metrics.taCount + ' TA (' + metrics.taAvg + '★)');
  });

  // Rebuild monthly + byGuide from the new weekly set
  rebuildHistoryAggregates(prior.history, prior.history.monthly);

  // Update generatedAt + weekLabel for the dashboard
  prior.generatedAt = new Date().toISOString();

  var finalJson = JSON.stringify(prior, null, 2);
  var driveFileId = writeDashboardDataToDrive(finalJson);
  Logger.log('');

  // Email the JSON directly as attachment so it's immediately available
  var C = getConfig();
  var attachment = Utilities.newBlob(finalJson, 'application/json', 'akwl-reviews-data.json');
  MailApp.sendEmail({
    to: C.EMAIL_TO,
    subject: 'AKWL Reviews — Mayo 2026 sembrado · data.json adjunto',
    body: 'Bootstrap completado.\n\nAdjunto el akwl-reviews-data.json con historial Ene–May.\n\nPasos:\n  1. Guardá el adjunto\n  2. Abrí el dashboard en Netlify\n  3. Click "↑ Upload data.json" → seleccioná el archivo\n\nGenerado: ' + new Date().toString(),
    attachments: [attachment],
    name: 'Alaska Wild Lights Reviews'
  });
  Logger.log('📧 JSON enviado como adjunto a ' + C.EMAIL_TO);
  Logger.log('✅ May 2026 seeded. Subí el adjunto al dashboard.');
}

// ============================================================
// MAIN PRODUCTION FUNCTION
// ============================================================
function runWeeklyReport() {
  // Prevent overlapping executions. If another instance is running, abort.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // wait up to 30 s for any in-progress run to finish
  } catch (e) {
    Logger.log('⚠  Could not acquire script lock — another run in progress. Aborting.');
    return;
  }

  var C = getConfig();
  try {
    Logger.log('');
    Logger.log('╔════════════════════════════════════════════╗');
    Logger.log('║ AKWL Weekly Reviews Engine v4.11.2        ║');
    Logger.log('╚════════════════════════════════════════════╝');
    Logger.log('');

    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('BOOTSTRAP_COMPLETED') !== 'true') {
      Logger.log('⚠️  BOOTSTRAP NOT INITIALIZED');
      Logger.log('   Run bootstrap_Initialize6MonthHistory() first');
      notifyFailure(C, 'Bootstrap missing',
        'runWeeklyReport aborted because BOOTSTRAP_COMPLETED is not set.\n' +
        'Run bootstrap_Initialize6MonthHistory() once before scheduling.');
      return;
    }

    var win = getWeekWindow();
    Logger.log('📅 DATE WINDOW:');
    Logger.log('   Start: ' + win.startDateStr + ' (Sunday)');
    Logger.log('   End: ' + win.endDateStr + ' (Saturday)');
    Logger.log('   Label: ' + win.weekLabel);
    Logger.log('');

    Logger.log('👥 Loading guides from sheet...');
    var guides = fetchGuideList(C);
    Logger.log('   ✓ Loaded ' + guides.length + ' guides');
    Logger.log('   Guides: ' + guides.join(', '));
    Logger.log('');

    // -------- Fetch each platform independently. One failure doesn't kill the
    //          other. Collect errors and notify at the end. --------
    Logger.log('📡 Fetching reviews from Apify...');
    var gmapsRaw = [];
    var taRaw    = [];
    var fetchErrors = [];

    try {
      gmapsRaw = fetchApifyReviews('gmaps', C, 50);
      Logger.log('   ✓ Google Maps: ' + gmapsRaw.length + ' reviews');
    } catch (e) {
      Logger.log('   ✗ Google Maps fetch failed: ' + e.message);
      fetchErrors.push('Google Maps: ' + e.message);
    }

    try {
      taRaw = fetchApifyReviews('tripadvisor', C, 50);
      Logger.log('   ✓ TripAdvisor: ' + taRaw.length + ' reviews');
    } catch (e) {
      Logger.log('   ✗ TripAdvisor fetch failed: ' + e.message);
      fetchErrors.push('TripAdvisor: ' + e.message);
    }
    Logger.log('');

    if (fetchErrors.length > 0) {
      notifyFailure(C, 'Apify scrape failure — ' + win.weekLabel,
        'One or more Apify scrapes failed during the weekly run:\n\n' +
        fetchErrors.join('\n\n') +
        '\n\nThe report continues with whatever platforms succeeded. ' +
        'Check the Apps Script execution log for details.');
    }

    if (gmapsRaw.length === 0 && taRaw.length === 0) {
      Logger.log('⛔ Both Apify scrapes returned no data. Aborting before sheets/email.');
      notifyFailure(C, 'Weekly run aborted — ' + win.weekLabel,
        'Both Google Maps and TripAdvisor scrapes failed or returned zero items. ' +
        'No sheets/email/GitHub updates were made. Cumulative state was NOT advanced.');
      return;
    }

    Logger.log('🔍 FILTERING BY DATE RANGE:');
    var gmapsWeek = filterByDateRange(gmapsRaw, win.startDateStr, win.endDateStr, 'gmaps');
    Logger.log('   Google Maps in range: ' + gmapsWeek.length);
    var taWeek = filterByDateRange(taRaw, win.startDateStr, win.endDateStr, 'tripadvisor');
    Logger.log('   TripAdvisor in range: ' + taWeek.length);
    Logger.log('');

    // The weekly report shows ALL reviews in the date range — even those that
    // were captured by bootstrap or a previous run. Dedup applies ONLY to the
    // cumulative all-time running state below, to avoid double-counting totals.
    Logger.log('🎯 MATCHING REVIEWS TO GUIDES:');
    var allReviews = gmapsWeek.concat(taWeek);
    var matched = matchReviewsToGuides(allReviews, guides);
    Logger.log('   Total matched: ' + matched.length);
    Logger.log('');

    var metrics = calculateMetrics(matched, guides, gmapsWeek, taWeek);

    // -------- Dedup ONLY for the all-time running state (not the weekly
    //          report). Reviews that already contributed to the bootstrap or a
    //          previous run must NOT be counted again in totals. --------
    Logger.log('🧹 DEDUP against SEEN_REVIEW_IDS (running state only):');
    var seenSet = {};
    getSeenReviewKeys().forEach(function(k){ seenSet[k] = true; });
    var gmBefore = gmapsWeek.length, taBefore = taWeek.length;
    var gmapsFresh = dedupReviews(gmapsWeek, seenSet);
    var taFresh    = dedupReviews(taWeek,    seenSet);
    Logger.log('   Google Maps fresh: ' + gmapsFresh.length + '/' + gmBefore);
    Logger.log('   TripAdvisor fresh: ' + taFresh.length + '/' + taBefore);
    Logger.log('');

    // Compute the cumulative running state but DO NOT persist yet — only after
    // sheets/email/github succeed below.
    var running = computeRunningState(gmapsFresh, taFresh);

    Logger.log('📝 Updating sheets...');
    updateWeeklyReviewsTab(C, metrics, guides, win.sundayLabel);
    updateFlaggedReviewsTab(C, metrics, win.weekLabel);
    Logger.log('   ✓ Sheets updated');
    Logger.log('');

    Logger.log('💾 Pushing legacy data.json to GitHub (backup)...');
    var jsonData = generateJSONData(metrics, running, win.weekLabel, C);
    try {
      pushToGitHub(jsonData, C);
      Logger.log('   ✓ Legacy data.json pushed');
    } catch (e) {
      Logger.log('   ⚠  GitHub backup push failed (non-fatal): ' + e.message);
    }
    Logger.log('');

    Logger.log('📊 Building dashboard data.json with accumulated history...');
    var dashboardJSON = buildDashboardJSON(metrics, running, win, C);
    var driveFileId = writeDashboardDataToDrive(dashboardJSON);
    Logger.log('   ✓ Saved to Drive');
    Logger.log('');

    Logger.log('📧 Emailing dashboard JSON link + team draft...');
    emailDashboardJSON(win.weekLabel, driveFileId, C);
    createEmailDraftHTML(metrics, running, win.weekLabel, C);
    Logger.log('   ✓ Dashboard JSON link emailed + team draft created');
    Logger.log('');

    // -------- Everything above succeeded. Persist state LAST so a partial
    //          failure earlier does not advance the cumulative totals. --------
    persistRunningState(running);
    saveSeenReviewKeys(Object.keys(seenSet));
    Logger.log('💾 Running state + seen-keys persisted.');
    Logger.log('');

    Logger.log('╔════════════════════════════════════════════╗');
    Logger.log('║        ✅ COMPLETED SUCCESSFULLY          ║');
    Logger.log('╚════════════════════════════════════════════╝');
    Logger.log('');
    Logger.log('📊 THIS WEEK SUMMARY:');
    Logger.log('   Google Maps: ' + metrics.gmapsCount + ' reviews, avg ' + metrics.gmapsAvg + '★');
    Logger.log('   TripAdvisor: ' + metrics.taCount + ' reviews, avg ' + metrics.taAvg + '★');
    Logger.log('   Total Bonuses: $' + metrics.totalBonus);
    Logger.log('');
    Logger.log('🔢 ALL-TIME RUNNING AVERAGES:');
    Logger.log('   Google Maps: ' + running.gmaps.avg + '★ (' + running.gmaps.count + ' total)');
    Logger.log('   TripAdvisor: ' + running.ta.avg + '★ (' + running.ta.count + ' total)');
    Logger.log('   Combined:    ' + running.combined.avg + '★ (' + running.combined.count + ' total)');
    Logger.log('');
  } catch (e) {
    Logger.log('💥 Unhandled error: ' + e.message);
    Logger.log(e.stack || '(no stack)');
    notifyFailure(C, 'Unhandled error during weekly run',
      'runWeeklyReport threw an unhandled error:\n\n' + e.message +
      '\n\nStack:\n' + (e.stack || '(no stack)') +
      '\n\nCumulative state was NOT advanced.');
    throw e; // re-throw so Apps Script shows the failure in the executions list
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// DATE WINDOW - FIXED FOR SUNDAY START
// ============================================================
function getWeekWindow() {
  var now = new Date();

  var todayStr = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  var parts = todayStr.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]);
  var day = parseInt(parts[2]);

  var todayUTC = new Date(Date.UTC(year, month-1, day));

  var dayName = Utilities.formatDate(now, TZ, 'EEEE');
  var dayMap = { 'Sunday':0,'Monday':1,'Tuesday':2,'Wednesday':3,'Thursday':4,'Friday':5,'Saturday':6 };
  var dow = dayMap[dayName];

  Logger.log('DEBUG: Today is ' + todayStr + ' (' + dayName + ', dow=' + dow + ')');

  // Always report on the PREVIOUS completed Sun-Sat week (Alaska time).
  // Day boundaries are at 00:00 America/Anchorage.
  //   Sun (dow=0) -> 7 days back to last Sunday  -> covers last week
  //   Mon (dow=1) -> 8 days back to last Sunday  -> still covers last week
  //   Sat (dow=6) -> 13 days back to prev Sunday -> covers week-before
  // Run it any day of the new week, you always get the just-completed week.
  var daysBack = dow + 7;
  var MS = 86400000;

  var sunUTC = new Date(todayUTC.getTime() - daysBack * MS);
  var satUTC = new Date(sunUTC.getTime() + 6 * MS);

  Logger.log('DEBUG: Days back = ' + daysBack);
  Logger.log('DEBUG: Sunday = ' + sunUTC.toUTCString());
  Logger.log('DEBUG: Saturday = ' + satUTC.toUTCString());

  function toYMD(d) {
    var mo = ('0'+(d.getUTCMonth()+1)).slice(-2);
    var dy = ('0'+d.getUTCDate()).slice(-2);
    return d.getUTCFullYear()+'-'+mo+'-'+dy;
  }

  function toMD(d) {
    return (d.getUTCMonth()+1) + '/' + d.getUTCDate();
  }

  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var weekLabel = months[sunUTC.getUTCMonth()]+' '+sunUTC.getUTCDate()+' – '+months[satUTC.getUTCMonth()]+' '+satUTC.getUTCDate()+', '+satUTC.getUTCFullYear();

  return {
    startDateStr:  toYMD(sunUTC),
    endDateStr:    toYMD(satUTC),
    weekLabel:     weekLabel,
    sundayLabel:   toMD(sunUTC)
  };
}

function fetchGuideList(C) {
  var ss = SpreadsheetApp.openById(C.EMPLOYEE_SHEET_ID);
  var sheet = ss.getSheetByName(C.EMPLOYEES_TAB);
  var data = sheet.getDataRange().getValues();
  var guides = [];

  for (var i = 1; i < data.length; i++) {
    var firstName = data[i][0] ? data[i][0].toString().trim() : '';
    var lastName = data[i][1] ? data[i][1].toString().trim() : '';
    var position = data[i][8] ? data[i][8].toString().toLowerCase() : '';

    if (firstName && lastName && position.indexOf('guide') !== -1) {
      guides.push(firstName + ' ' + lastName);
    }
  }

  return guides;
}

function fetchApifyReviews(platform, C, maxCount) {
  maxCount = maxCount || 50;
  if (!C.APIFY_TOKEN) throw new Error('APIFY_TOKEN is not set in Script Properties');

  var actorId, input;
  if (platform === 'gmaps') {
    actorId = 'compass~google-maps-reviews-scraper';
    input = { startUrls: [{ url: C.GMAPS_URL }], maxReviews: maxCount, reviewsSort: 'newest', language: 'en' };
  } else {
    actorId = 'maxcopell~tripadvisor-reviews';
    input = { startUrls: [{ url: C.TA_URL }], maxReviews: maxCount, sort: 'NEWEST' };
  }

  var runResp = fetchWithRetry(
    'https://api.apify.com/v2/acts/' + actorId + '/runs?token=' + C.APIFY_TOKEN,
    { method:'post', contentType:'application/json', payload:JSON.stringify(input), muteHttpExceptions:true }
  );

  var runData = JSON.parse(runResp.getContentText());
  if (!runData.data || !runData.data.id) throw new Error('Apify run failed to start: ' + runResp.getContentText());

  var runId = runData.data.id, datasetId = runData.data.defaultDatasetId;
  var status = 'RUNNING', attempts = 0;

  // Poll every 15 s up to 20 times (5 min total).
  while (status !== 'SUCCEEDED' && attempts < 20) {
    Utilities.sleep(15000);
    var s = JSON.parse(fetchWithRetry(
      'https://api.apify.com/v2/actor-runs/' + runId + '?token=' + C.APIFY_TOKEN,
      { muteHttpExceptions: true }
    ).getContentText());
    status = s.data.status;
    attempts++;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error('Apify run ' + runId + ' ended with status ' + status);
    }
  }

  if (status !== 'SUCCEEDED') throw new Error('Apify run ' + runId + ' did not succeed within ' + (15*attempts) + 's (status=' + status + ')');

  var items = JSON.parse(fetchWithRetry(
    'https://api.apify.com/v2/datasets/' + datasetId + '/items?token=' + C.APIFY_TOKEN + '&limit=200',
    { muteHttpExceptions: true }
  ).getContentText());
  return items.map(function(r){ r._platform = platform; return r; });
}

function filterByDateRange(reviews, startDateStr, endDateStr, platform) {
  var filtered = reviews.filter(function(r) {
    var raw = r.publishedAtDate || r.publishedDate || r.date || r.reviewDate || r.time || '';
    if (!raw) return false;
    try {
      var d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      var dStr = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
      var inRange = dStr >= startDateStr && dStr <= endDateStr;
      if (inRange) {
        Logger.log('   MATCH (' + platform + '): ' + dStr + ' | ' + (r.text||r.reviewText||'').substring(0,50));
      }
      return inRange;
    } catch(e) { return false; }
  });

  return filtered;
}

function matchReviewsToGuides(reviews, guides) {
  var aliases = getGuideAliases();
  return reviews.map(function(r) {
    var text = ((r.text||r.reviewText||'')+ ' '+(r.title||'')).toLowerCase();
    r.assignedGuides = findGuidesInText(text, guides, aliases);
    // Keep a single-guide field for any legacy reader; first matched guide wins.
    r.assignedGuide = r.assignedGuides[0];
    return r;
  });
}

// Returns ALL guides mentioned in the review text (deduped). A review may
// credit multiple guides — e.g. "Jodi and Ripley were both great" returns
// ['Jodi Bailey', 'RIpley Caldwell']. Falls back to ['UNASSIGNED'] when no
// guide name is found.
function findGuidesInText(text, guides, aliases) {
  var matched = {};            // canonical name -> true (dedup set)
  var words = text.match(/\b[\w'-]+\b/g) || [];

  // 1. Alias substring match (e.g. "dillion" -> "Dylan Berggren").
  for (var alias in aliases) {
    if (text.indexOf(alias) !== -1) matched[aliases[alias]] = true;
  }
  // 2. Full-name substring match.
  for (var i = 0; i < guides.length; i++) {
    if (text.indexOf(guides[i].toLowerCase()) !== -1) matched[guides[i]] = true;
  }
  // 3. Last-name whole-word match (length >= 4 to avoid common words).
  for (var i = 0; i < guides.length; i++) {
    var parts = guides[i].toLowerCase().split(' ');
    var lastName = parts[parts.length - 1];
    if (lastName.length >= 4 && words.indexOf(lastName) !== -1) {
      matched[guides[i]] = true;
    }
  }
  // 4. First-name whole-word match (length >= 4).
  for (var i = 0; i < guides.length; i++) {
    var firstName = guides[i].toLowerCase().split(' ')[0];
    if (firstName.length >= 4 && words.indexOf(firstName) !== -1) {
      matched[guides[i]] = true;
    }
  }

  var result = Object.keys(matched);
  if (result.length === 0) {
    Logger.log('   UNASSIGNED — text snippet: "' + text.substring(0, 120).replace(/\s+/g, ' ') + '"');
    for (var i = 0; i < guides.length; i++) {
      var p = guides[i].toLowerCase().split(' ');
      Logger.log('     no match: ' + guides[i] + ' (tried full="' + guides[i].toLowerCase() +
                 '", last="' + p[p.length - 1] + '", first="' + p[0] + '")');
    }
    return ['UNASSIGNED'];
  }
  if (result.length > 1) {
    Logger.log('   MULTI-GUIDE MATCH: ' + result.join(', '));
  }
  return result;
}

function calculateMetrics(matched, guides, gmapsWeek, taWeek) {
  var stats = {};
  guides.forEach(function(g){stats[g]={name:g,gmaps:0,ta:0,fiveStar:0,bonus:0};});
  stats['UNASSIGNED']={name:'UNASSIGNED',gmaps:0,ta:0,fiveStar:0,bonus:0};

  var lowRating = [];
  var totalFiveStar = 0;

  matched.forEach(function(r) {
    var rating = parseInt(r.stars||r.rating||r.bubbleRating||0);
    var platform = r._platform;
    // A review may credit multiple guides. Each one gets full credit
    // (count, 5-star tally, and bonus). To split bonuses instead, divide
    // bonusAmount by assignedGuides.length below.
    var assignedGuides = (r.assignedGuides && r.assignedGuides.length)
      ? r.assignedGuides
      : [r.assignedGuide || 'UNASSIGNED'];
    var bonusAmount = (platform === 'gmaps' ? 10 : 5);

    assignedGuides.forEach(function(guide) {
      if (!stats[guide]) stats[guide]={name:guide,gmaps:0,ta:0,fiveStar:0,bonus:0};
      if (platform==='gmaps') stats[guide].gmaps++;
      else stats[guide].ta++;
      if (rating === 5) {
        stats[guide].fiveStar++;
        stats[guide].bonus += bonusAmount;
      }
    });

    // totalFiveStar counts reviews, not per-guide credits.
    if (rating === 5) totalFiveStar++;

    if (rating >= 1 && rating <= 2) {
      lowRating.push({
        guide: assignedGuides.join(', '),
        rating: rating,
        platform: r._platform,
        text: r.text||r.reviewText||''
      });
    }
  });

  function avg(a){return a.length?(a.reduce(function(s,v){return s+v;},0)/a.length).toFixed(1):'N/A';}
  var gmR=gmapsWeek.map(function(r){return parseInt(r.stars||r.rating||0);}).filter(function(n){return n>0;});
  var taR=taWeek.map(function(r){return parseInt(r.rating||r.bubbleRating||0);}).filter(function(n){return n>0;});
  var totalBonus=0;

  var list=guides.map(function(g){totalBonus+=stats[g].bonus;return stats[g];});
  list.sort(function(a,b){return b.bonus-a.bonus;});

  return {
    guideStats:list,
    lowRating:lowRating,
    gmapsCount:gmapsWeek.length,
    taCount:taWeek.length,
    combinedCount:matched.length,
    gmapsAvg:avg(gmR),
    taAvg:avg(taR),
    combinedAvg:avg(gmR.concat(taR)),
    totalBonus:totalBonus,
    totalFiveStar:totalFiveStar
  };
}

// Pure: reads the persisted cumulative totals, adds this week's deltas, and
// returns the new state. Does NOT write back — caller decides when to persist.
function computeRunningState(gmapsWeek, taWeek) {
  var props = PropertiesService.getScriptProperties();

  var gmapsCount = parseInt(props.getProperty('BOOTSTRAP_GMAPS_COUNT') || '0');
  var gmapsStars = parseFloat(props.getProperty('BOOTSTRAP_GMAPS_STARS') || '0');
  var taCount    = parseInt(props.getProperty('BOOTSTRAP_TA_COUNT') || '0');
  var taStars    = parseFloat(props.getProperty('BOOTSTRAP_TA_STARS') || '0');

  gmapsWeek.forEach(function(r) {
    var rat = parseInt(r.stars || r.rating || 0);
    if (rat > 0) { gmapsCount++; gmapsStars += rat; }
  });
  taWeek.forEach(function(r) {
    var rat = parseInt(r.rating || r.bubbleRating || 0);
    if (rat > 0) { taCount++; taStars += rat; }
  });

  var gmapsAvg   = gmapsCount > 0 ? (gmapsStars / gmapsCount).toFixed(2) : '0.00';
  var taAvg      = taCount    > 0 ? (taStars / taCount).toFixed(2)       : '0.00';
  var totalCount = gmapsCount + taCount;
  var totalStars = gmapsStars + taStars;
  var combinedAvg = totalCount > 0 ? (totalStars / totalCount).toFixed(2) : '0.00';

  return {
    gmaps:    { count: gmapsCount, stars: gmapsStars, avg: gmapsAvg },
    ta:       { count: taCount,    stars: taStars,    avg: taAvg },
    combined: { count: totalCount, avg: combinedAvg }
  };
}

// Writes the computed running state to Script Properties. Call this LAST so a
// partial failure in sheets/email/github doesn't advance the cumulative totals.
function persistRunningState(state) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('BOOTSTRAP_GMAPS_COUNT', state.gmaps.count.toString());
  props.setProperty('BOOTSTRAP_GMAPS_STARS', state.gmaps.stars.toString());
  props.setProperty('BOOTSTRAP_TA_COUNT',    state.ta.count.toString());
  props.setProperty('BOOTSTRAP_TA_STARS',    state.ta.stars.toString());
}

function updateWeeklyReviewsTab(C, metrics, guides, sundayLabel) {
  var ss=SpreadsheetApp.openById(C.DATA_SHEET_ID);
  var sheet=ss.getSheetByName(C.REVIEWS_TAB);

  if (!sheet) {
    sheet=ss.insertSheet(C.REVIEWS_TAB);
    sheet.getRange(1,1).setValue('Guide');
  }

  var lastCol=sheet.getLastColumn()||1;
  var headers=sheet.getRange(1,1,1,lastCol).getValues()[0];
  var colIndex=-1;

  for (var h=0;h<headers.length;h++) {
    if(headers[h].toString().trim() === sundayLabel) {
      colIndex=h+1;
      break;
    }
  }

  if (colIndex === -1) {
    colIndex = lastCol + 1;
    sheet.getRange(1, colIndex).setValue(sundayLabel);
  }

  var lastRow=sheet.getLastRow(), guideRows={};
  if (lastRow>=2) {
    var col=sheet.getRange(2,1,lastRow-1,1).getValues();
    for(var r=0;r<col.length;r++) guideRows[col[r][0].toString().trim()] = r+2;
  }

  var fiveMap={};
  metrics.guideStats.forEach(function(g){ fiveMap[g.name] = g.fiveStar; });

  guides.forEach(function(name){
    var row = guideRows[name];
    if(!row) { row = (sheet.getLastRow()||1)+1; sheet.getRange(row,1).setValue(name); }
    sheet.getRange(row, colIndex).setValue(fiveMap[name] || 0);
  });
}

function updateFlaggedReviewsTab(C, metrics, weekLabel) {
  var ss=SpreadsheetApp.openById(C.DATA_SHEET_ID);
  var sheet=ss.getSheetByName(C.FLAGGED_TAB);

  if (!sheet){
    sheet=ss.insertSheet(C.FLAGGED_TAB);
    sheet.appendRow(['Platform','Guide','Text']);
  }

  metrics.lowRating.forEach(function(r){
    var plat = r.platform==='gmaps'?'Google Maps':'TripAdvisor';
    sheet.appendRow([plat, r.guide, (r.text||'').substring(0,200)]);
  });
}

function generateJSONData(metrics, runningState, weekLabel, C) {
  var data = {
    weekLabel: weekLabel,
    timestamp: new Date().toISOString(),
    summary: {
      totalReviews: metrics.combinedCount,
      gmapsCount: metrics.gmapsCount,
      gmapsAvg: metrics.gmapsAvg,
      taCount: metrics.taCount,
      taAvg: metrics.taAvg,
      combinedAvg: metrics.combinedAvg,
      totalBonus: metrics.totalBonus
    },
    guides: metrics.guideStats.filter(function(g) { return g.name !== 'UNASSIGNED'; }),
    lowRatings: metrics.lowRating.map(function(r) {
      return {
        guide: r.guide,
        rating: r.rating,
        platform: r.platform,
        text: r.text
      };
    }),
    // FIX 3: Added averageRating/totalReviews aliases so dashboard.html
    // (which reads allTime.averageRating and allTime.totalReviews) renders.
    allTime: {
      googleMaps:    { count: runningState.gmaps.count,    avg: runningState.gmaps.avg },
      tripAdvisor:   { count: runningState.ta.count,       avg: runningState.ta.avg    },
      combined:      { count: runningState.combined.count, avg: runningState.combined.avg },
      averageRating: runningState.combined.avg,
      totalReviews:  runningState.combined.count
    }
  };
  return JSON.stringify(data, null, 2);
}

// ============================================================
// v4.12 — NEW DASHBOARD DATA BUILDER + EMAIL-WITH-ATTACHMENT
// ============================================================
// This builds the FULL data.json for the Netlify dashboard, including
// accumulated history (monthly + weekly + byGuide). State is persisted
// in a Google Drive file (akwl-reviews-data.json) keyed by Script Property
// DRIVE_FILE_ID. Each weekly run:
//   1. Reads previous data.json from Drive
//   2. Appends current week to history.weekly
//   3. Updates current month bucket in history.monthly
//   4. Updates history.byGuide YTD counters
//   5. Writes back to Drive
//   6. Emails the data.json as an attachment to ALERT_EMAIL
//
// User workflow: Open email → Save data.json → Open Netlify dashboard →
// Click "↑ Upload data.json" → Done. localStorage in the dashboard keeps
// it loaded for repeat visits.
// ============================================================

// Active guides list — the only guides that appear in the dashboard.
function getActiveGuides() {
  return [
    'Jessica Verrault','Shannon Williams','Ryan Stebbins','Dylan Berggren',
    'Jodi Bailey','Tyler Trainor','RIpley Caldwell','Milo Pranther',
    'Rich Cohen','John Kane','Sierra Baker','Wesley Campbell',
    'Sullivan Bogardus','Pepper Burrel','Greg McDaniel','Gina Sliger'
  ];
}

// Rebuilds history.monthly and history.byGuide from history.weekly. Historical
// monthly entries (months with no weekly data, e.g. Jan–Apr seeded from
// data.json) are preserved from priorMonthly. Mutates history in place.
// Idempotent — safe to call multiple times.
function rebuildHistoryAggregates(history, priorMonthly) {
  priorMonthly = priorMonthly || [];
  history.weekly = history.weekly || [];

  function blankPlatformEntry() {
    return { count: 0, stars: 0, fiveStar: 0, avg: null, breakdown: {'5':0,'4':0,'3':0,'2':0,'1':0} };
  }

  // Which months are covered by weekly data
  var weeklyMonths = {};
  history.weekly.forEach(function(w) {
    if (w.endDate) weeklyMonths[w.endDate.substring(0, 7)] = true;
  });

  // Preserve historical months not covered by any weekly entry
  var historicalMonthly = priorMonthly.filter(function(m) { return !weeklyMonths[m.month]; });

  // Rebuild monthly from weekly (Google Maps + TripAdvisor); carry over
  // other-platform data (GetYourGuide, Civitatis, etc.) from prior month entry.
  var computedMonthly = {};
  history.weekly.forEach(function(w) {
    var ym = w.endDate ? w.endDate.substring(0, 7) : null;
    if (!ym) return;
    if (!computedMonthly[ym]) {
      var priorMonth = priorMonthly.filter(function(m) { return m.month === ym; })[0] || null;
      computedMonthly[ym] = {
        month: ym,
        platforms: {
          tripAdvisor:  blankPlatformEntry(),
          googleMaps:   blankPlatformEntry(),
          getYourGuide: priorMonth && priorMonth.platforms && priorMonth.platforms.getYourGuide ? JSON.parse(JSON.stringify(priorMonth.platforms.getYourGuide)) : blankPlatformEntry(),
          civitatis:    priorMonth && priorMonth.platforms && priorMonth.platforms.civitatis    ? JSON.parse(JSON.stringify(priorMonth.platforms.civitatis))    : blankPlatformEntry(),
          expedia:      priorMonth && priorMonth.platforms && priorMonth.platforms.expedia      ? JSON.parse(JSON.stringify(priorMonth.platforms.expedia))      : blankPlatformEntry(),
          atmosRewards: priorMonth && priorMonth.platforms && priorMonth.platforms.atmosRewards ? JSON.parse(JSON.stringify(priorMonth.platforms.atmosRewards)) : blankPlatformEntry(),
          bookingCom:   priorMonth && priorMonth.platforms && priorMonth.platforms.bookingCom   ? JSON.parse(JSON.stringify(priorMonth.platforms.bookingCom))   : blankPlatformEntry()
        },
        totalReviews: 0, totalStars: 0, combinedAvg: null, totalBonus: 0
      };
    }
    var mc = computedMonthly[ym];
    var gmCount = w.platforms.googleMaps.count || 0;
    var gmStars = (w.platforms.googleMaps.avg || 0) * gmCount;
    var taCount = w.platforms.tripAdvisor.count || 0;
    var taStars = (w.platforms.tripAdvisor.avg || 0) * taCount;
    mc.platforms.googleMaps.count += gmCount;
    mc.platforms.googleMaps.stars += gmStars;
    mc.platforms.googleMaps.fiveStar += w.platforms.googleMaps.fiveStar || 0;
    mc.platforms.tripAdvisor.count += taCount;
    mc.platforms.tripAdvisor.stars += taStars;
    mc.platforms.tripAdvisor.fiveStar += w.platforms.tripAdvisor.fiveStar || 0;
    mc.totalReviews += w.totalReviews || 0;
    mc.totalStars += gmStars + taStars;
    mc.totalBonus += w.totalBonus || 0;
  });
  Object.keys(computedMonthly).forEach(function(ym) {
    var mc = computedMonthly[ym];
    mc.platforms.googleMaps.avg = mc.platforms.googleMaps.count > 0 ? parseFloat((mc.platforms.googleMaps.stars / mc.platforms.googleMaps.count).toFixed(2)) : null;
    mc.platforms.tripAdvisor.avg = mc.platforms.tripAdvisor.count > 0 ? parseFloat((mc.platforms.tripAdvisor.stars / mc.platforms.tripAdvisor.count).toFixed(2)) : null;
    mc.combinedAvg = mc.totalReviews > 0 ? parseFloat((mc.totalStars / mc.totalReviews).toFixed(2)) : null;
  });
  history.monthly = historicalMonthly.concat(Object.keys(computedMonthly).map(function(k) { return computedMonthly[k]; }));
  history.monthly.sort(function(a, b) { return a.month < b.month ? -1 : 1; });

  // Rebuild byGuide from weekly entries
  history.byGuide = [];
  var byGuideMap = {};
  history.weekly.forEach(function(w) {
    var ym = w.endDate ? w.endDate.substring(0, 7) : null;
    (w.guides || []).forEach(function(g) {
      if (!byGuideMap[g.name]) {
        byGuideMap[g.name] = { name: g.name, active: true, ytdFiveStar: 0, ytdBonus: 0, monthlyFiveStar: {} };
        history.byGuide.push(byGuideMap[g.name]);
      }
      byGuideMap[g.name].ytdFiveStar += g.fiveStar || 0;
      byGuideMap[g.name].ytdBonus += g.bonus || 0;
      if (ym && g.fiveStar > 0) {
        byGuideMap[g.name].monthlyFiveStar[ym] = (byGuideMap[g.name].monthlyFiveStar[ym] || 0) + (g.fiveStar || 0);
      }
    });
  });
}

// Reads the latest dashboard data.json from Drive. Returns null if not set.
function readDashboardDataFromDrive() {
  var fileId = PropertiesService.getScriptProperties().getProperty('DRIVE_FILE_ID');
  if (!fileId) return null;
  try {
    var file = DriveApp.getFileById(fileId);
    return JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    Logger.log('   ⚠  Failed to read Drive file: ' + e.message);
    return null;
  }
}

// Returns the "AKWL Reviews Dashboard" Drive folder, creating it if needed.
function getOrCreateDashboardFolder() {
  var name = 'AKWL Reviews Dashboard';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

// Writes the dashboard data.json to Drive inside the "AKWL Reviews Dashboard"
// folder. Creates the file on first call and saves the ID to Script Properties.
// Sets sharing to "anyone with link" so the emailed download link works directly.
function writeDashboardDataToDrive(jsonContent) {
  var props = PropertiesService.getScriptProperties();
  var fileId = props.getProperty('DRIVE_FILE_ID');
  var blob = Utilities.newBlob(jsonContent, 'application/json', 'akwl-reviews-data.json');

  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      file.setContent(jsonContent);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
      return fileId;
    } catch (e) {
      Logger.log('   ⚠  Stale Drive file ID, creating new: ' + e.message);
    }
  }
  var folder = getOrCreateDashboardFolder();
  var newFile = folder.createFile(blob);
  newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('DRIVE_FILE_ID', newFile.getId());
  Logger.log('   ✓ Created Drive file in "AKWL Reviews Dashboard" folder: ' + newFile.getId());
  return newFile.getId();
}

// Builds the FULL dashboard JSON: current week + accumulated history.
function buildDashboardJSON(metrics, runningState, win, C) {
  var prior = readDashboardDataFromDrive() || {};
  var history = prior.history || { monthly: [], weekly: [], byGuide: [] };

  // Current week summary (for current.* block)
  var current = {
    weekLabel: win.weekLabel,
    summary: {
      totalReviews: metrics.combinedCount,
      gmapsCount: metrics.gmapsCount,
      gmapsAvg: metrics.gmapsAvg,
      taCount: metrics.taCount,
      taAvg: metrics.taAvg,
      combinedAvg: metrics.combinedAvg,
      totalBonus: metrics.totalBonus
    },
    guides: metrics.guideStats.filter(function(g) { return g.name !== 'UNASSIGNED'; }),
    lowRatings: metrics.lowRating.map(function(r) {
      return { guide: r.guide, rating: r.rating, platform: r.platform, text: r.text };
    })
  };

  // Append to history.weekly (one entry per run)
  history.weekly = history.weekly || [];
  // Dedupe by weekLabel: replace if already exists
  var wIdx = history.weekly.findIndex(function(w) { return w.weekLabel === win.weekLabel; });
  var weeklyEntry = {
    weekLabel: win.weekLabel,
    startDate: win.startDateStr,
    endDate: win.endDateStr,
    timestamp: new Date().toISOString(),
    platforms: {
      googleMaps: { count: metrics.gmapsCount, avg: parseFloat(metrics.gmapsAvg) || 0, fiveStar: 0 },
      tripAdvisor: { count: metrics.taCount, avg: parseFloat(metrics.taAvg) || 0, fiveStar: 0 }
    },
    totalReviews: metrics.combinedCount,
    totalBonus: metrics.totalBonus,
    guides: metrics.guideStats.filter(function(g) { return g.name !== 'UNASSIGNED'; })
  };
  if (wIdx >= 0) history.weekly[wIdx] = weeklyEntry;
  else history.weekly.push(weeklyEntry);

  // Rebuild history.monthly + history.byGuide from history.weekly (idempotent).
  rebuildHistoryAggregates(history, prior.history && prior.history.monthly ? prior.history.monthly : []);

  // Build YTD platform totals from history.monthly
  var ytdPlat = {
    tripAdvisor:  { displayName:'TripAdvisor',  color:'#a78bfa', count:0, stars:0, fiveStar:0 },
    googleMaps:   { displayName:'Google Maps',  color:'#00d4a8', count:0, stars:0, fiveStar:0 },
    getYourGuide: { displayName:'GetYourGuide', color:'#ffa657', count:0, stars:0, fiveStar:0 },
    civitatis:    { displayName:'Civitatis',    color:'#ff5470', count:0, stars:0, fiveStar:0 },
    expedia:      { displayName:'Expedia',      color:'#60a5fa', count:0, stars:0, fiveStar:0 },
    atmosRewards: { displayName:'Atmos Rewards',color:'#ffd166', count:0, stars:0, fiveStar:0 },
    bookingCom:   { displayName:'Booking.com',  color:'#10b981', count:0, stars:0, fiveStar:0 }
  };
  history.monthly.forEach(function(mo) {
    Object.keys(ytdPlat).forEach(function(k) {
      if (mo.platforms[k]) {
        ytdPlat[k].count += mo.platforms[k].count || 0;
        ytdPlat[k].stars += mo.platforms[k].stars || 0;
        ytdPlat[k].fiveStar += mo.platforms[k].fiveStar || 0;
      }
    });
  });
  Object.keys(ytdPlat).forEach(function(k) {
    var p = ytdPlat[k];
    p.avg = p.count > 0 ? parseFloat((p.stars / p.count).toFixed(2)) : null;
  });
  var ytdCombined = {
    count: Object.keys(ytdPlat).reduce(function(s,k) { return s + ytdPlat[k].count; }, 0),
    stars: Object.keys(ytdPlat).reduce(function(s,k) { return s + ytdPlat[k].stars; }, 0),
    fiveStar: Object.keys(ytdPlat).reduce(function(s,k) { return s + ytdPlat[k].fiveStar; }, 0)
  };
  ytdCombined.avg = ytdCombined.count > 0 ? parseFloat((ytdCombined.stars / ytdCombined.count).toFixed(2)) : null;
  ytdCombined.totalBonus = ytdPlat.googleMaps.fiveStar * 10 + ytdPlat.tripAdvisor.fiveStar * 5;

  // Build the full dashboard data.json
  var data = {
    generatedAt: new Date().toISOString(),
    year: 2026,
    weekLabel: win.weekLabel,
    platforms: [
      {key:'tripAdvisor',  displayName:'TripAdvisor',  color:'#a78bfa'},
      {key:'googleMaps',   displayName:'Google Maps',  color:'#00d4a8'},
      {key:'getYourGuide', displayName:'GetYourGuide', color:'#ffa657'},
      {key:'civitatis',    displayName:'Civitatis',    color:'#ff5470'},
      {key:'expedia',      displayName:'Expedia',      color:'#60a5fa'},
      {key:'atmosRewards', displayName:'Atmos Rewards',color:'#ffd166'},
      {key:'bookingCom',   displayName:'Booking.com',  color:'#10b981'}
    ],
    activeGuides: getActiveGuides(),
    ytd2026: {
      byPlatform: ytdPlat,
      combined: ytdCombined,
      source: 'Apps Script weekly accumulation (Google Maps + TripAdvisor scraping via Apify). Other platforms from manual seeding.'
    },
    current: current,
    // Legacy allTime block for backward compatibility
    allTime: {
      googleMaps:  { count: runningState.gmaps.count, avg: runningState.gmaps.avg },
      tripAdvisor: { count: runningState.ta.count, avg: runningState.ta.avg },
      combined:    { count: runningState.combined.count, avg: runningState.combined.avg },
      averageRating: runningState.combined.avg,
      totalReviews: runningState.combined.count
    },
    history: history
  };
  return JSON.stringify(data, null, 2);
}

// Emails a download link for the dashboard data.json stored in Drive.
function emailDashboardJSON(weekLabel, fileId, C) {
  var subject = 'AKWL Weekly Reviews — ' + weekLabel;
  var dashUrl = PropertiesService.getScriptProperties().getProperty('DASHBOARD_URL') || '';
  var downloadUrl = 'https://drive.google.com/uc?export=download&id=' + fileId;

  var body =
    'Weekly Reviews — ' + weekLabel + '\n\n' +
    'Descargá el archivo actualizado:\n' +
    downloadUrl + '\n\n' +
    (dashUrl ? 'Dashboard: ' + dashUrl + '\n\n' : '') +
    'Pasos:\n' +
    '  1. Click el link de arriba → descarga akwl-reviews-data.json\n' +
    '  2. Abrí el dashboard\n' +
    '  3. Click "↑ Upload data.json" → seleccioná el archivo\n\n' +
    'Generado: ' + new Date().toString();

  MailApp.sendEmail({
    to: C.EMAIL_TO,
    subject: subject,
    body: body,
    name: 'Alaska Wild Lights Reviews'
  });
  Logger.log('   ✓ Link enviado a ' + C.EMAIL_TO);
}

function pushToGitHub(jsonContent, C) {
  if (!C.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set in Script Properties');

  var apiUrl = 'https://api.github.com/repos/' + C.GITHUB_USERNAME + '/' + C.GITHUB_REPO + '/contents/' + C.GITHUB_FILE;
  var headers = {
    'Authorization': 'token ' + C.GITHUB_TOKEN,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'AKWL-Engine'
  };

  var sha = null;
  try {
    var get = fetchWithRetry(apiUrl, { headers: headers, muteHttpExceptions: true });
    if (get.getResponseCode() === 200) {
      sha = JSON.parse(get.getContentText()).sha;
    }
  } catch (e) {
    Logger.log('   (GET sha failed, will PUT without sha): ' + e.message);
  }

  var blob = Utilities.newBlob(jsonContent, 'application/json', 'UTF-8');
  var encoded = Utilities.base64Encode(blob.getBytes());

  var payload = {
    message: 'Dashboard update — ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
    content: encoded,
    branch: C.GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;

  var put = fetchWithRetry(apiUrl, {
    method: 'put',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = put.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub push failed: HTTP ' + code + ' — ' + put.getContentText().substring(0, 300));
  }
}

function createEmailDraftHTML(metrics, runningState, weekLabel, C) {
  var subject = 'AKWL Weekly Reviews — ' + weekLabel;
  var dashUrl = 'https://alaskawildlights.github.io/akwl-reviews/dashboard.html';

  var bonus = metrics.guideStats.filter(function(g){return g.bonus>0;});

  var bonusRows = '';
  if(bonus.length>0){
    bonus.forEach(function(g){
      bonusRows += '<tr><td style="padding:10px">' + g.name + '</td>' +
                   '<td style="padding:10px;text-align:center">' + g.gmaps + '</td>' +
                   '<td style="padding:10px;text-align:center">' + g.ta + '</td>' +
                   '<td style="padding:10px;text-align:center;font-weight:bold;color:#2e7d32">$' + g.bonus + '</td></tr>';
    });
  }

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#333;background:#f5f5f5;margin:0;padding:20px}' +
    '.container{max-width:700px;margin:0 auto;background:white;padding:30px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}' +
    'h1{color:#0d47a1;margin-top:0;margin-bottom:5px}' +
    '.week{color:#666;font-size:14px;margin-bottom:20px}' +
    '.metrics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin:20px 0}' +
    '.metric{border:1px solid #ddd;padding:15px;border-radius:5px;background:#f9f9f9;text-align:center}' +
    '.metric-value{font-size:32px;font-weight:bold;color:#0d47a1;line-height:1}' +
    '.metric-label{font-size:11px;color:#999;text-transform:uppercase;margin-top:8px}' +
    '.metric-avg{font-size:14px;color:#666;margin-top:5px}' +
    'table{width:100%;border-collapse:collapse;margin:20px 0}' +
    'th{background:#e8eef8;padding:12px;text-align:left;border-bottom:2px solid #0d47a1;color:#0d47a1;font-weight:bold}' +
    'td{padding:10px;border-bottom:1px solid #eee}' +
    'tr:last-child{background:#e8eef8;font-weight:bold}' +
    'a{color:#0d47a1;text-decoration:none}' +
    'a:hover{text-decoration:underline}' +
    '.section-title{color:#0d47a1;font-size:16px;font-weight:bold;margin-top:25px;margin-bottom:10px}' +
    '.info-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:15px 0;border-radius:4px}' +
    '.success-box{background:#d4edda;border-left:4px solid #28a745;padding:15px;margin:15px 0;border-radius:4px}' +
    '.footer{font-size:12px;color:#999;margin-top:30px;padding-top:20px;border-top:1px solid #eee}' +
    '</style></head><body>' +
    '<div class="container">' +
    '<h1>🌌 Alaska Wild Lights</h1>' +
    '<div class="week">Weekly Reviews — ' + weekLabel + '</div>' +
    '<div class="metrics">' +
    '<div class="metric"><div class="metric-value">' + metrics.gmapsCount + '</div><div class="metric-label">Google Maps</div><div class="metric-avg">' + metrics.gmapsAvg + '★</div></div>' +
    '<div class="metric"><div class="metric-value">' + metrics.taCount + '</div><div class="metric-label">TripAdvisor</div><div class="metric-avg">' + metrics.taAvg + '★</div></div>' +
    '<div class="metric"><div class="metric-value">' + metrics.combinedCount + '</div><div class="metric-label">Combined</div><div class="metric-avg">' + metrics.combinedAvg + '★</div></div>' +
    '</div>' +
    '<div class="section-title">All-Time Running Averages</div>' +
    '<table><tr><th>Platform</th><th style="text-align:center">Reviews</th><th style="text-align:center">Average</th></tr>' +
    '<tr><td>Google Maps</td><td style="text-align:center">' + runningState.gmaps.count + '</td><td style="text-align:center;font-weight:bold">' + runningState.gmaps.avg + '★</td></tr>' +
    '<tr><td>TripAdvisor</td><td style="text-align:center">' + runningState.ta.count + '</td><td style="text-align:center;font-weight:bold">' + runningState.ta.avg + '★</td></tr>' +
    '<tr><td><strong>Combined</strong></td><td style="text-align:center"><strong>' + runningState.combined.count + '</strong></td><td style="text-align:center;color:#0d47a1"><strong>' + runningState.combined.avg + '★</strong></td></tr>' +
    '</table>' +
    '<div class="section-title">5-Star Bonus Earners</div>' +
    '<p style="font-size:13px;color:#666">$10 per Google Maps review | $5 per TripAdvisor review</p>';

  if(bonus.length>0){
    html += '<table><tr><th>Guide</th><th style="text-align:center">Google</th><th style="text-align:center">TA</th><th style="text-align:center">Bonus</th></tr>' +
            bonusRows +
            '<tr><td style="padding:10px"><strong>TOTAL</strong></td><td style="text-align:center">—</td><td style="text-align:center">—</td><td style="text-align:center"><strong style="color:#2e7d32">$' + metrics.totalBonus + '</strong></td></tr></table>';
  } else {
    html += '<div class="success-box">✓ No 5-star reviews this week</div>';
  }

  if(metrics.lowRating.length > 0){
    html += '<div class="info-box">⚠️ <strong>' + metrics.lowRating.length + ' low-rating review(s)</strong> — Check the Flagged Reviews sheet for details</div>';
  } else {
    html += '<div class="success-box">✓ No 1-2 star reviews this week</div>';
  }

  html += '<div class="section-title">Quick Links</div>' +
    '<p><a href="' + dashUrl + '">📊 Dashboard</a> | ' +
    '<a href="' + C.WEEKLY_REVIEWS_URL + '">📋 Weekly Reviews</a> | ' +
    '<a href="' + C.FLAGGED_REVIEWS_URL + '">⚠️ Flagged</a> | ' +
    '<a href="' + C.EMPLOYEE_INFO_URL + '">👥 Team</a></p>' +
    '<div class="footer">Generated automatically by AKWL Reviews Engine v4.11</div>' +
    '</div></body></html>';

  // FIX 2: Always pass a non-empty plain-text body. Some Gmail clients render
  // an empty/garbled message when the plain-text part is ''.
  var plainFallback = 'Weekly Reviews — ' + weekLabel + '\n\n' +
    'This email requires an HTML-capable email client.\n\n' +
    'View dashboard: ' + dashUrl;

  // Main team email: create a DRAFT (not sent) so it can be reviewed/edited
  // before manually sending to the team.
  GmailApp.createDraft(C.EMAIL_TO, subject, plainFallback, {
    cc: C.EMAIL_CC,
    htmlBody: html,
    name: 'Alaska Wild Lights Reviews'
  });
}

// Minimal HTML escape for values interpolated into the preview banner.
function escapeHtmlGs(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
