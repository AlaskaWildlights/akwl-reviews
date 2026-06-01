// ==============================================================
// ALASKA WILD LIGHTS — Weekly Reviews Engine v5.0
//
// Platforms: Google Maps + TripAdvisor (auto-scraped via Apify)
//            + GetYourGuide, Civitatis, Expedia, Atmos, Booking
//              (manual entry via Google Sheet "Manual Reviews" tab)
//
// Runs every Monday at 6 AM Alaska time via Apps Script trigger.
// Pushes data.json to GitHub → Netlify auto-deploys the dashboard.
// ==============================================================

var TZ = 'America/Anchorage';

// ==============================================================
// ★★★  WHERE TO PUT YOUR TOKENS  ★★★
//
// NEVER paste tokens directly into this file.
//
// Go to Apps Script → Project Settings → Script Properties
// and add these key-value pairs:
//
//  ┌────────────────────┬──────────────────────────────────────┐
//  │ Property Name      │ How to get it                        │
//  ├────────────────────┼──────────────────────────────────────┤
//  │ APIFY_TOKEN        │ apify.com → Account → Integrations   │
//  │                    │ (REQUIRED for scraping)               │
//  ├────────────────────┼──────────────────────────────────────┤
//  │ GITHUB_TOKEN       │ github.com → Settings →              │
//  │                    │ Developer settings →                  │
//  │                    │ Personal access tokens → Classic →    │
//  │                    │ Generate new → scope: [✓] repo →     │
//  │                    │ Copy the token                        │
//  │                    │ (REQUIRED for dashboard auto-deploy)  │
//  └────────────────────┴──────────────────────────────────────┘
//
// Optional overrides (defaults shown in getConfig() below):
//   GITHUB_USERNAME, GITHUB_REPO, GITHUB_BRANCH, GITHUB_FILE
//   EMAIL_TO, EMAIL_CC, ALERT_EMAIL
// ==============================================================

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    // ── TOKENS: set in Script Properties, NEVER hardcode here ─
    APIFY_TOKEN:  props.getProperty('APIFY_TOKEN')  || '',
    GITHUB_TOKEN: props.getProperty('GITHUB_TOKEN') || '',

    // ── GitHub: data.json is pushed to 'main' so Netlify picks it up ─
    GITHUB_USERNAME: props.getProperty('GITHUB_USERNAME') || 'alaskawildlights',
    GITHUB_REPO:     props.getProperty('GITHUB_REPO')     || 'akwl-reviews',
    GITHUB_BRANCH:   props.getProperty('GITHUB_BRANCH')   || 'main',
    GITHUB_FILE:     props.getProperty('GITHUB_FILE')     || 'data.json',

    // ── Email ─────────────────────────────────────────────────
    EMAIL_TO:    props.getProperty('EMAIL_TO')    || 'info@alaskawildlights.com',
    EMAIL_CC:    props.getProperty('EMAIL_CC')    || 'joshuamcneal@alaskawildlights.com,ashley@alaskawildlights.com,kyle@alaskawildlights.com',
    ALERT_EMAIL: props.getProperty('ALERT_EMAIL') || 'awlsaray@gmail.com',

    // ── Google Sheets (do not change unless you change the sheet IDs) ─
    EMPLOYEE_SHEET_ID: '1lhB25hdKfARc6nGjbN9AwYGHQ_bsLRdGkeCuQA7Ow9w',
    EMPLOYEES_TAB:     'current employees',
    DATA_SHEET_ID:     '1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU',
    REVIEWS_TAB:       'Weekly Guide Reviews',
    FLAGGED_TAB:       'Weekly Flagged Reviews',
    MANUAL_TAB:        'Manual Reviews',  // new tab for non-Apify platforms

    // ── Apify URLs ────────────────────────────────────────────
    GMAPS_URL: 'https://www.google.com/maps/place/Alaska+Wild+Lights/@64.8108581,-147.7021919,17z/data=!4m18!1m9!3m8!1s0x5133b2ea9da03823:0x2eb3eeb2ebb1dd22!2sAlaska+Wild+Lights!8m2!3d64.8108674!4d-147.7031564!9m1!1b1!16s%2Fg%2F11f_j7gq5t!3m7!1s0x5133b2ea9da03823:0x2eb3eeb2ebb1dd22!8m2!3d64.8108674!4d-147.7031564!9m1!1b1!16s%2Fg%2F11f_j7gq5t?entry=ttu&g_ep=EgoyMDI2MDQxMi4wIKXMDSoASAFQAw%3D%3D',
    TA_URL:    'https://www.tripadvisor.com/Attraction_Review-g31079-d3559823-Reviews-Alaska_Wild_Lights-North_Pole_Alaska.html',

    // ── Quick-links in team email ─────────────────────────────
    DASHBOARD_URL:       'https://alaskawildlights.github.io/akwl-reviews/',
    WEEKLY_REVIEWS_URL:  'https://docs.google.com/spreadsheets/d/1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU/edit?gid=2078759448#gid=2078759448',
    FLAGGED_REVIEWS_URL: 'https://docs.google.com/spreadsheets/d/1CNmg85Ap4qc_LsHy3_M7rq0YkYleeHJ8cmb66NTgRMU/edit?gid=1421445550#gid=1421445550',
    EMPLOYEE_INFO_URL:   'https://docs.google.com/spreadsheets/d/1lhB25hdKfARc6nGjbN9AwYGHQ_bsLRdGkeCuQA7Ow9w/edit?gid=0#gid=0'
  };
}

function getGuideAliases() {
  return {
    'dillion': 'Dylan Berggren',
    'dillon':  'Dylan Berggren',
    'sheena':  'Shannon Williams',
    'shannon': 'Shannon Williams',
    'regina':  'Gina Sliger',
    'ginna':   'Gina Sliger'
  };
}

// ==============================================================
// HISTORY_BASELINE_2026  —  DO NOT DELETE OR EDIT THIS BLOCK
//
// Hardcoded safety net. Contains:
//   • Jan–Apr 2026 monthly totals (all platforms, from Reviews Tracker)
//   • All May 2026 weekly entries (from Apps Script runs)
//   • Pre-computed YTD totals through May 30, 2026
//   • Per-guide 5-star totals through May 30, 2026
//
// This block survives any data loss. The script always starts
// here and only adds new weeks on top.
// ==============================================================
var HISTORY_BASELINE_2026 = {
  // Monthly totals Jan–Apr (per-platform breakdowns from the Reviews Tracker)
  monthly: [
    { month: '2026-01', estimated: true,
      totalReviews: 49, totalStars: 233, combinedAvg: 4.76, totalBonus: 200,
      platforms: {
        tripAdvisor:  { count:37, stars:177, fiveStar:34, avg:4.78, breakdown:{5:34,4:0,3:1,2:2,1:0} },
        googleMaps:   { count:4,  stars:16,  fiveStar:3,  avg:4.0,  breakdown:{5:3,4:0,3:0,2:0,1:1} },
        getYourGuide: { count:8,  stars:40,  fiveStar:8,  avg:5.0,  breakdown:{5:8,4:0,3:0,2:0,1:0} },
        civitatis:    { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        expedia:      { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        atmosRewards: { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        bookingCom:   { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} }
      }
    },
    { month: '2026-02', estimated: true,
      totalReviews: 66, totalStars: 295, combinedAvg: 4.47, totalBonus: 280,
      platforms: {
        tripAdvisor:  { count:22, stars:99,  fiveStar:18, avg:4.5,  breakdown:{5:18,4:1,3:1,2:0,1:2} },
        googleMaps:   { count:19, stars:95,  fiveStar:19, avg:5.0,  breakdown:{5:19,4:0,3:0,2:0,1:0} },
        getYourGuide: { count:21, stars:90,  fiveStar:14, avg:4.29, breakdown:{5:14,4:3,3:1,2:2,1:1} },
        civitatis:    { count:1,  stars:2,   fiveStar:0,  avg:2.0,  breakdown:{5:0,4:0,3:0,2:1,1:0} },
        expedia:      { count:3,  stars:9,   fiveStar:0,  avg:3.0,  breakdown:{5:0,4:0,3:3,2:0,1:0} },
        atmosRewards: { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        bookingCom:   { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} }
      }
    },
    { month: '2026-03', estimated: true,
      totalReviews: 115, totalStars: 517, combinedAvg: 4.5, totalBonus: 460,
      platforms: {
        tripAdvisor:  { count:66, stars:300, fiveStar:50, avg:4.55, breakdown:{5:50,4:10,3:2,2:0,1:4} },
        googleMaps:   { count:23, stars:107, fiveStar:21, avg:4.65, breakdown:{5:21,4:0,3:0,2:0,1:2} },
        getYourGuide: { count:25, stars:105, fiveStar:16, avg:4.2,  breakdown:{5:16,4:3,3:3,2:1,1:2} },
        civitatis:    { count:1,  stars:5,   fiveStar:1,  avg:5.0,  breakdown:{5:1,4:0,3:0,2:0,1:0} },
        expedia:      { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        atmosRewards: { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        bookingCom:   { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} }
      }
    },
    { month: '2026-04', estimated: true,
      totalReviews: 15, totalStars: 56, combinedAvg: 3.73, totalBonus: 40,
      platforms: {
        tripAdvisor:  { count:14, stars:55,  fiveStar:8,  avg:3.93, breakdown:{5:8,4:1,3:3,2:0,1:2} },
        googleMaps:   { count:1,  stars:1,   fiveStar:0,  avg:1.0,  breakdown:{5:0,4:0,3:0,2:0,1:1} },
        getYourGuide: { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        civitatis:    { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        expedia:      { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        atmosRewards: { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} },
        bookingCom:   { count:0,  stars:0,   fiveStar:0,  avg:null, breakdown:{5:0,4:0,3:0,2:0,1:0} }
      }
    }
  ],

  // May 2026 weekly entries (Apps Script runs)
  weekly: [
    { weekLabel:'May 3 – May 9, 2026', startDate:'2026-05-03', endDate:'2026-05-09',
      platforms:{ googleMaps:{count:2,avg:5.0,fiveStar:2}, tripAdvisor:{count:4,avg:4.75,fiveStar:4} },
      totalReviews:6, totalBonus:45,
      guides:[
        {name:'Shannon Williams', gmaps:2, ta:2, fiveStar:4, bonus:30, gmapsFiveStar:2, taFiveStar:2},
        {name:'Dylan Berggren',   gmaps:1, ta:1, fiveStar:2, bonus:15, gmapsFiveStar:1, taFiveStar:1}
      ]},
    { weekLabel:'May 10 – May 16, 2026', startDate:'2026-05-10', endDate:'2026-05-16',
      platforms:{ googleMaps:{count:1,avg:5.0,fiveStar:1}, tripAdvisor:{count:1,avg:5.0,fiveStar:1} },
      totalReviews:2, totalBonus:20,
      guides:[
        {name:'Jodi Bailey',     gmaps:1, ta:0, fiveStar:1, bonus:10, gmapsFiveStar:1, taFiveStar:0},
        {name:'RIpley Caldwell', gmaps:1, ta:0, fiveStar:1, bonus:10, gmapsFiveStar:1, taFiveStar:0}
      ]},
    { weekLabel:'May 17 – May 23, 2026', startDate:'2026-05-17', endDate:'2026-05-23',
      platforms:{ googleMaps:{count:3,avg:4.7,fiveStar:3}, tripAdvisor:{count:1,avg:5.0,fiveStar:1} },
      totalReviews:4, totalBonus:30,
      guides:[
        {name:'Shannon Williams', gmaps:2, ta:0, fiveStar:2, bonus:20, gmapsFiveStar:2, taFiveStar:0},
        {name:'Sierra Baker',     gmaps:1, ta:0, fiveStar:1, bonus:10, gmapsFiveStar:1, taFiveStar:0}
      ]},
    { weekLabel:'May 24 – May 30, 2026', startDate:'2026-05-24', endDate:'2026-05-30',
      platforms:{ googleMaps:{count:8,avg:4.5,fiveStar:7}, tripAdvisor:{count:2,avg:5.0,fiveStar:2} },
      totalReviews:10, totalBonus:65,
      guides:[
        {name:'Shannon Williams', gmaps:3, ta:0, fiveStar:3, bonus:30, gmapsFiveStar:3, taFiveStar:0},
        {name:'Pepper Burrel',    gmaps:1, ta:1, fiveStar:2, bonus:15, gmapsFiveStar:1, taFiveStar:1},
        {name:'Dylan Berggren',   gmaps:1, ta:0, fiveStar:1, bonus:10, gmapsFiveStar:1, taFiveStar:0},
        {name:'Jodi Bailey',      gmaps:1, ta:0, fiveStar:1, bonus:10, gmapsFiveStar:1, taFiveStar:0}
      ]}
  ],

  // Pre-computed YTD through May 30, 2026 (all platforms combined)
  ytd2026: {
    byPlatform: {
      tripAdvisor:  { displayName:'TripAdvisor',   color:'#a78bfa', count:147, stars:663,   fiveStar:112, avg:4.51 },
      googleMaps:   { displayName:'Google Maps',   color:'#00d4a8', count:61,  stars:284.1,  fiveStar:50,  avg:4.66 },
      getYourGuide: { displayName:'GetYourGuide',  color:'#ffa657', count:54,  stars:235,   fiveStar:38,  avg:4.35 },
      civitatis:    { displayName:'Civitatis',      color:'#ff5470', count:2,   stars:7,     fiveStar:1,   avg:3.5  },
      expedia:      { displayName:'Expedia',        color:'#60a5fa', count:3,   stars:9,     fiveStar:0,   avg:3.0  },
      atmosRewards: { displayName:'Atmos Rewards',  color:'#ffd166', count:0,   stars:0,     fiveStar:0,   avg:null },
      bookingCom:   { displayName:'Booking.com',    color:'#10b981', count:0,   stars:0,     fiveStar:0,   avg:null }
    },
    combined: { count:267, stars:1198.1, fiveStar:201, avg:4.49, totalBonus:1045 },
    source: 'Jan–Apr 2026 from Reviews Tracker. May 2026 from Apps Script (Apify scraping).'
  },

  // Per-guide totals through May 30, 2026 (Jan-Apr monthly only; May added from weekly[] above)
  byGuide: {
    'Jessica Verrault':  { monthlyFiveStar:{'2026-01':7,'2026-02':2,'2026-03':1} },
    'Shannon Williams':  { monthlyFiveStar:{'2026-01':4,'2026-03':5} },
    'Ryan Stebbins':     { monthlyFiveStar:{'2026-02':2,'2026-03':3} },
    'Dylan Berggren':    { monthlyFiveStar:{'2026-03':5,'2026-04':1} },
    'Jodi Bailey':       { monthlyFiveStar:{} },
    'Tyler Trainor':     { monthlyFiveStar:{'2026-01':1,'2026-02':7} },
    'RIpley Caldwell':   { monthlyFiveStar:{} },
    'Milo Pranther':     { monthlyFiveStar:{} },
    'Rich Cohen':        { monthlyFiveStar:{} },
    'John Kane':         { monthlyFiveStar:{} },
    'Sierra Baker':      { monthlyFiveStar:{} },
    'Wesley Campbell':   { monthlyFiveStar:{} },
    'Sullivan Bogardus': { monthlyFiveStar:{} },
    'Pepper Burrel':     { monthlyFiveStar:{} },
    'Greg McDaniel':     { monthlyFiveStar:{'2026-02':2,'2026-03':3} },
    'Gina Sliger':       { monthlyFiveStar:{} }
  }
};

// ==============================================================
// HELPERS — retries, alerts, dedup
// ==============================================================

function fetchWithRetry(url, options, maxAttempts) {
  maxAttempts = maxAttempts || 3;
  var lastErr;
  for (var i = 0; i < maxAttempts; i++) {
    try {
      var resp = UrlFetchApp.fetch(url, options || {});
      var code = resp.getResponseCode();
      if (code < 500) return resp;
      lastErr = new Error('HTTP ' + code + ' from ' + url);
    } catch (e) {
      lastErr = e;
    }
    if (i < maxAttempts - 1) Utilities.sleep(Math.pow(2, i + 1) * 1000);
  }
  throw lastErr || new Error('fetchWithRetry: all attempts failed for ' + url);
}

function notifyFailure(C, subject, body) {
  try {
    MailApp.sendEmail({ to: C.ALERT_EMAIL, subject: '[AKWL Reviews] ' + subject, body: body });
    Logger.log('   ✉  Alert sent to ' + C.ALERT_EMAIL);
  } catch (e) {
    Logger.log('   ⚠  Could not send alert email: ' + e.message);
  }
}

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
  var capped = keysArray.slice(-1000);
  PropertiesService.getScriptProperties().setProperty('SEEN_REVIEW_IDS', JSON.stringify(capped));
}

function dedupReviews(reviews, seenSet) {
  var fresh = [];
  reviews.forEach(function(r) {
    var k = reviewKey(r);
    if (!seenSet[k]) { fresh.push(r); seenSet[k] = true; }
  });
  return fresh;
}

// ==============================================================
// DATE WINDOW
// ==============================================================

function getWeekWindow() {
  var now = new Date();
  var todayStr = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  var parts = todayStr.split('-');
  var todayUTC = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])));

  var dayName = Utilities.formatDate(now, TZ, 'EEEE');
  var dayMap = {Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6};
  var dow = dayMap[dayName];

  Logger.log('DEBUG: Today is ' + todayStr + ' (' + dayName + ', dow=' + dow + ')');

  // Always report on the previous completed Sun–Sat week (Alaska time).
  var daysBack = dow + 7;
  var MS = 86400000;
  var sunUTC = new Date(todayUTC.getTime() - daysBack * MS);
  var satUTC = new Date(sunUTC.getTime() + 6 * MS);

  Logger.log('DEBUG: Days back = ' + daysBack + ', Sunday = ' + sunUTC.toUTCString());

  function toYMD(d) {
    return d.getUTCFullYear() + '-' + ('0'+(d.getUTCMonth()+1)).slice(-2) + '-' + ('0'+d.getUTCDate()).slice(-2);
  }
  function toMD(d) { return (d.getUTCMonth()+1) + '/' + d.getUTCDate(); }

  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var weekLabel = months[sunUTC.getUTCMonth()] + ' ' + sunUTC.getUTCDate() +
                  ' – ' + months[satUTC.getUTCMonth()] + ' ' + satUTC.getUTCDate() +
                  ', ' + satUTC.getUTCFullYear();

  return {
    startDateStr: toYMD(sunUTC),
    endDateStr:   toYMD(satUTC),
    weekLabel:    weekLabel,
    sundayLabel:  toMD(sunUTC)
  };
}

// ==============================================================
// DATA FETCHING
// ==============================================================

function fetchGuideList(C) {
  var ss = SpreadsheetApp.openById(C.EMPLOYEE_SHEET_ID);
  var sheet = ss.getSheetByName(C.EMPLOYEES_TAB);
  var data = sheet.getDataRange().getValues();
  var guides = [];
  for (var i = 1; i < data.length; i++) {
    var firstName = data[i][0] ? data[i][0].toString().trim() : '';
    var lastName  = data[i][1] ? data[i][1].toString().trim() : '';
    var position  = data[i][8] ? data[i][8].toString().toLowerCase() : '';
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
    input = { startUrls:[{url:C.GMAPS_URL}], maxReviews:maxCount, reviewsSort:'newest', language:'en' };
  } else {
    actorId = 'maxcopell~tripadvisor-reviews';
    input = { startUrls:[{url:C.TA_URL}], maxReviews:maxCount, sort:'NEWEST' };
  }

  var runResp = fetchWithRetry(
    'https://api.apify.com/v2/acts/' + actorId + '/runs?token=' + C.APIFY_TOKEN,
    { method:'post', contentType:'application/json', payload:JSON.stringify(input), muteHttpExceptions:true }
  );
  var runData = JSON.parse(runResp.getContentText());
  if (!runData.data || !runData.data.id) throw new Error('Apify run failed to start: ' + runResp.getContentText());

  var runId = runData.data.id, datasetId = runData.data.defaultDatasetId;
  var status = 'RUNNING', attempts = 0;

  // Poll every 15 s, up to 20 times (5 min total).
  while (status !== 'SUCCEEDED' && attempts < 20) {
    Utilities.sleep(15000);
    var s = JSON.parse(fetchWithRetry(
      'https://api.apify.com/v2/actor-runs/' + runId + '?token=' + C.APIFY_TOKEN,
      { muteHttpExceptions:true }
    ).getContentText());
    status = s.data.status;
    attempts++;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error('Apify run ' + runId + ' ended with status ' + status);
    }
  }
  if (status !== 'SUCCEEDED') throw new Error('Apify run ' + runId + ' did not complete in time');

  var items = JSON.parse(fetchWithRetry(
    'https://api.apify.com/v2/datasets/' + datasetId + '/items?token=' + C.APIFY_TOKEN + '&limit=200',
    { muteHttpExceptions:true }
  ).getContentText());
  return items.map(function(r){ r._platform = platform; return r; });
}

// Reads the "Manual Reviews" tab in the Data Sheet.
// Expected columns (header row):
//   Date | Platform | Rating | ReviewText | GuideMatch | Bonus | WeekLabel | Counted
//
// Platforms accepted: GetYourGuide, Civitatis, Expedia, AtmosRewards, BookingCom, Other
// Set Counted = TRUE to prevent double-counting on next run.
function fetchManualReviews(weekStart, weekEnd, C) {
  var ss = SpreadsheetApp.openById(C.DATA_SHEET_ID);
  var sheet = ss.getSheetByName(C.MANUAL_TAB);
  if (!sheet) {
    Logger.log('   ℹ  No "' + C.MANUAL_TAB + '" tab found — skipping manual reviews');
    return [];
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h){ return h.toString().toLowerCase().replace(/\s+/g,''); });
  var col = {
    date:     headers.indexOf('date'),
    platform: headers.indexOf('platform'),
    rating:   headers.indexOf('rating'),
    text:     headers.indexOf('reviewtext'),
    guide:    headers.indexOf('guidematch'),
    bonus:    headers.indexOf('bonus'),
    counted:  headers.indexOf('counted')
  };

  var reviews = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (col.counted >= 0 && (row[col.counted] === true || String(row[col.counted]).toLowerCase() === 'true')) continue;

    var dateVal = col.date >= 0 ? row[col.date] : null;
    if (!dateVal) continue;

    var dateStr;
    try {
      dateStr = Utilities.formatDate(new Date(dateVal), TZ, 'yyyy-MM-dd');
    } catch(e) { continue; }

    if (dateStr < weekStart || dateStr > weekEnd) continue;

    var platRaw = col.platform >= 0 ? String(row[col.platform]).trim() : 'Other';
    var platKey = platRaw.toLowerCase().replace(/[^a-z]/g, '');
    // Normalize to canonical keys
    var platMap = {
      getyourguide:'getYourGuide', gyg:'getYourGuide',
      civitatis:'civitatis',
      expedia:'expedia',
      atmosrewards:'atmosRewards', atmos:'atmosRewards',
      bookingcom:'bookingCom', booking:'bookingCom',
      other:'other'
    };
    var normalizedPlat = platMap[platKey] || platKey;

    var guideVal = col.guide >= 0 ? String(row[col.guide]).trim() : 'UNASSIGNED';
    if (!guideVal) guideVal = 'UNASSIGNED';

    reviews.push({
      _platform:     normalizedPlat,
      _manual:       true,
      _rowIndex:     i + 1,
      _sheetBonus:   col.bonus >= 0 ? (parseInt(row[col.bonus]) || 0) : 0,
      rating:        col.rating >= 0 ? (parseInt(row[col.rating]) || 0) : 0,
      text:          col.text   >= 0 ? String(row[col.text])   : '',
      assignedGuide:  guideVal,
      assignedGuides: [guideVal]
    });

    if (col.counted >= 0) {
      sheet.getRange(i + 1, col.counted + 1).setValue(true);
    }
  }

  Logger.log('   ✓ Manual Reviews: ' + reviews.length + ' for ' + weekStart + ' – ' + weekEnd);
  return reviews;
}

function filterByDateRange(reviews, startDateStr, endDateStr, platform) {
  return reviews.filter(function(r) {
    var raw = r.publishedAtDate || r.publishedDate || r.date || r.reviewDate || r.time || '';
    if (!raw) return false;
    try {
      var d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      var dStr = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
      var inRange = dStr >= startDateStr && dStr <= endDateStr;
      if (inRange) Logger.log('   MATCH (' + platform + '): ' + dStr + ' | ' + (r.text||r.reviewText||'').substring(0,50));
      return inRange;
    } catch(e) { return false; }
  });
}

// ==============================================================
// GUIDE MATCHING
// ==============================================================

function matchReviewsToGuides(reviews, guides) {
  var aliases = getGuideAliases();
  return reviews.map(function(r) {
    if (r._manual) return r; // manual reviews already have GuideMatch set
    var text = ((r.text||r.reviewText||'') + ' ' + (r.title||'')).toLowerCase();
    r.assignedGuides = findGuidesInText(text, guides, aliases);
    r.assignedGuide  = r.assignedGuides[0];
    return r;
  });
}

function findGuidesInText(text, guides, aliases) {
  var matched = {};
  var words = text.match(/\b[\w'-]+\b/g) || [];

  for (var alias in aliases) {
    if (text.indexOf(alias) !== -1) matched[aliases[alias]] = true;
  }
  for (var i = 0; i < guides.length; i++) {
    if (text.indexOf(guides[i].toLowerCase()) !== -1) matched[guides[i]] = true;
  }
  for (var i = 0; i < guides.length; i++) {
    var parts = guides[i].toLowerCase().split(' ');
    var lastName = parts[parts.length - 1];
    if (lastName.length >= 4 && words.indexOf(lastName) !== -1) matched[guides[i]] = true;
  }
  for (var i = 0; i < guides.length; i++) {
    var firstName = guides[i].toLowerCase().split(' ')[0];
    if (firstName.length >= 4 && words.indexOf(firstName) !== -1) matched[guides[i]] = true;
  }

  var result = Object.keys(matched);
  if (result.length === 0) {
    Logger.log('   UNASSIGNED: "' + text.substring(0,80).replace(/\s+/g,' ') + '"');
    return ['UNASSIGNED'];
  }
  if (result.length > 1) Logger.log('   MULTI-GUIDE: ' + result.join(', '));
  return result;
}

// ==============================================================
// METRICS
// ==============================================================

function calculateMetrics(matched, guides, gmapsWeek, taWeek, manualWeek) {
  manualWeek = manualWeek || [];
  var stats = {};
  guides.forEach(function(g){ stats[g] = {name:g, gmaps:0, ta:0, fiveStar:0, bonus:0, gmapsFiveStar:0, taFiveStar:0, manual:0}; });
  stats['UNASSIGNED'] = {name:'UNASSIGNED', gmaps:0, ta:0, fiveStar:0, bonus:0, gmapsFiveStar:0, taFiveStar:0, manual:0};

  var lowRating = [];
  var totalFiveStar = 0;
  var manualByPlatform = {};

  matched.forEach(function(r) {
    var rating  = parseInt(r.stars || r.rating || r.bubbleRating || 0);
    var platform = r._platform;
    var assignedGuides = (r.assignedGuides && r.assignedGuides.length) ? r.assignedGuides : [r.assignedGuide || 'UNASSIGNED'];
    var bonusAmount = platform === 'gmaps' ? 10 : (platform === 'tripadvisor' ? 5 : 0);
    if (r._manual && r._sheetBonus) bonusAmount = r._sheetBonus;

    assignedGuides.forEach(function(guide) {
      if (!stats[guide]) stats[guide] = {name:guide, gmaps:0, ta:0, fiveStar:0, bonus:0, gmapsFiveStar:0, taFiveStar:0, manual:0};
      if (platform === 'gmaps') { stats[guide].gmaps++; }
      else if (platform === 'tripadvisor') { stats[guide].ta++; }
      else { stats[guide].manual++; }

      if (rating === 5) {
        stats[guide].fiveStar++;
        stats[guide].bonus += bonusAmount;
        if (platform === 'gmaps') stats[guide].gmapsFiveStar++;
        else if (platform === 'tripadvisor') stats[guide].taFiveStar++;
      }
    });

    if (rating === 5) totalFiveStar++;
    if (rating >= 1 && rating <= 2) {
      lowRating.push({ guide:assignedGuides.join(', '), rating:rating, platform:platform, text:r.text||r.reviewText||'' });
    }

    // Accumulate manual-platform stats for the dashboard JSON
    if (r._manual) {
      if (!manualByPlatform[platform]) manualByPlatform[platform] = { count:0, fiveStar:0, stars:0 };
      manualByPlatform[platform].count++;
      if (rating === 5) manualByPlatform[platform].fiveStar++;
      if (rating > 0) manualByPlatform[platform].stars += rating;
    }
  });

  function avg(a) { return a.length ? (a.reduce(function(s,v){return s+v;},0)/a.length).toFixed(1) : 'N/A'; }
  var gmR = gmapsWeek.map(function(r){ return parseInt(r.stars||r.rating||0); }).filter(function(n){ return n > 0; });
  var taR = taWeek.map(function(r){ return parseInt(r.rating||r.bubbleRating||0); }).filter(function(n){ return n > 0; });
  var totalBonus = 0;

  var list = guides.map(function(g){ totalBonus += stats[g].bonus; return stats[g]; });
  list.sort(function(a,b){ return b.bonus - a.bonus; });

  return {
    guideStats:      list,
    lowRating:       lowRating,
    gmapsCount:      gmapsWeek.length,
    taCount:         taWeek.length,
    manualCount:     manualWeek.length,
    combinedCount:   matched.length,
    gmapsAvg:        avg(gmR),
    taAvg:           avg(taR),
    combinedAvg:     avg(gmR.concat(taR)),
    totalBonus:      totalBonus,
    totalFiveStar:   totalFiveStar,
    manualByPlatform: manualByPlatform
  };
}

// ==============================================================
// RUNNING STATE (all-time cumulative for allTime section)
// ==============================================================

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

  var gmapsAvg    = gmapsCount > 0 ? (gmapsStars / gmapsCount).toFixed(2) : '0.00';
  var taAvg       = taCount    > 0 ? (taStars    / taCount   ).toFixed(2) : '0.00';
  var totalCount  = gmapsCount + taCount;
  var combinedAvg = totalCount > 0 ? ((gmapsStars + taStars) / totalCount).toFixed(2) : '0.00';

  return {
    gmaps:    { count:gmapsCount, stars:gmapsStars, avg:gmapsAvg },
    ta:       { count:taCount,    stars:taStars,    avg:taAvg    },
    combined: { count:totalCount, avg:combinedAvg }
  };
}

function persistRunningState(state) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('BOOTSTRAP_GMAPS_COUNT', state.gmaps.count.toString());
  props.setProperty('BOOTSTRAP_GMAPS_STARS', state.gmaps.stars.toString());
  props.setProperty('BOOTSTRAP_TA_COUNT',    state.ta.count.toString());
  props.setProperty('BOOTSTRAP_TA_STARS',    state.ta.stars.toString());
}

// ==============================================================
// SHEET UPDATES
// ==============================================================

function updateWeeklyReviewsTab(C, metrics, guides, sundayLabel) {
  var ss = SpreadsheetApp.openById(C.DATA_SHEET_ID);
  var sheet = ss.getSheetByName(C.REVIEWS_TAB);
  if (!sheet) { sheet = ss.insertSheet(C.REVIEWS_TAB); sheet.getRange(1,1).setValue('Guide'); }

  var lastCol = sheet.getLastColumn() || 1;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIndex = -1;
  for (var h = 0; h < headers.length; h++) {
    if (headers[h].toString().trim() === sundayLabel) { colIndex = h + 1; break; }
  }
  if (colIndex === -1) { colIndex = lastCol + 1; sheet.getRange(1, colIndex).setValue(sundayLabel); }

  var lastRow = sheet.getLastRow(), guideRows = {};
  if (lastRow >= 2) {
    var col = sheet.getRange(2, 1, lastRow-1, 1).getValues();
    for (var r = 0; r < col.length; r++) guideRows[col[r][0].toString().trim()] = r + 2;
  }

  var fiveMap = {};
  metrics.guideStats.forEach(function(g){ fiveMap[g.name] = g.fiveStar; });

  guides.forEach(function(name) {
    var row = guideRows[name];
    if (!row) { row = (sheet.getLastRow()||1)+1; sheet.getRange(row, 1).setValue(name); }
    sheet.getRange(row, colIndex).setValue(fiveMap[name] || 0);
  });
}

function updateFlaggedReviewsTab(C, metrics, weekLabel) {
  var ss = SpreadsheetApp.openById(C.DATA_SHEET_ID);
  var sheet = ss.getSheetByName(C.FLAGGED_TAB);
  if (!sheet) { sheet = ss.insertSheet(C.FLAGGED_TAB); sheet.appendRow(['Week','Platform','Guide','Rating','Text']); }
  metrics.lowRating.forEach(function(r) {
    var plat = r.platform === 'gmaps' ? 'Google Maps' : (r.platform === 'tripadvisor' ? 'TripAdvisor' : r.platform);
    sheet.appendRow([weekLabel, plat, r.guide, r.rating, (r.text||'').substring(0,300)]);
  });
}

// ==============================================================
// DASHBOARD JSON BUILDER
// ==============================================================

// Fetches the current data.json from GitHub to recover any weekly
// entries added since the HISTORY_BASELINE_2026 was set.
function readCurrentDataFromGitHub(C) {
  if (!C.GITHUB_TOKEN) return null;
  var apiUrl = 'https://api.github.com/repos/' + C.GITHUB_USERNAME + '/' + C.GITHUB_REPO + '/contents/' + C.GITHUB_FILE + '?ref=' + C.GITHUB_BRANCH;
  try {
    var resp = fetchWithRetry(apiUrl, {
      headers: { 'Authorization':'token ' + C.GITHUB_TOKEN, 'Accept':'application/vnd.github.v3+json', 'User-Agent':'AKWL-Engine' },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return null;
    var meta = JSON.parse(resp.getContentText());
    var decoded = Utilities.newBlob(Utilities.base64Decode(meta.content.replace(/\n/g,'')), 'application/json', 'UTF-8').getDataAsString();
    return JSON.parse(decoded);
  } catch(e) {
    Logger.log('   (Could not read current GitHub data.json: ' + e.message + ')');
    return null;
  }
}

var PLATFORM_DEFS = [
  { key:'tripAdvisor',  displayName:'TripAdvisor',   color:'#a78bfa' },
  { key:'googleMaps',   displayName:'Google Maps',   color:'#00d4a8' },
  { key:'getYourGuide', displayName:'GetYourGuide',  color:'#ffa657' },
  { key:'civitatis',    displayName:'Civitatis',      color:'#ff5470' },
  { key:'expedia',      displayName:'Expedia',        color:'#60a5fa' },
  { key:'atmosRewards', displayName:'Atmos Rewards',  color:'#ffd166' },
  { key:'bookingCom',   displayName:'Booking.com',    color:'#10b981' }
];

function emptyPlatformSlot(def) {
  return { displayName:def.displayName, color:def.color, count:0, stars:0, fiveStar:0, avg:null,
           breakdown:{5:0,4:0,3:0,2:0,1:0} };
}

function emptyMonthEntry(month) {
  var platforms = {};
  PLATFORM_DEFS.forEach(function(d){ platforms[d.key] = emptyPlatformSlot(d); });
  return { month:month, estimated:false, totalReviews:0, totalStars:0, combinedAvg:null, totalBonus:0, platforms:platforms };
}

// Builds the full data.json for the dashboard.
// Strategy:
//   1. HISTORY_BASELINE_2026 covers Jan–May 30, 2026.
//   2. readCurrentDataFromGitHub() recovers any weeks between the baseline
//      and this run (weeks AFTER 2026-05-30 not already in the baseline).
//   3. currentWeekEntry is the freshly scraped week.
//   4. All three sources are merged; the monthly and byGuide aggregates
//      are recomputed from scratch from the merged weekly list.
function buildDashboardJSON(metrics, win, guides, running, C) {
  var now = new Date();

  // ── 1. Baseline weekly entries ───────────────────────────────
  var baselineWeekLabels = {};
  HISTORY_BASELINE_2026.weekly.forEach(function(w){ baselineWeekLabels[w.weekLabel] = true; });

  // ── 2. Extra weeks from GitHub (post-baseline) ───────────────
  var extraWeekly = [];
  try {
    var currentData = readCurrentDataFromGitHub(C);
    if (currentData && currentData.history && currentData.history.weekly) {
      extraWeekly = currentData.history.weekly.filter(function(w){
        return !baselineWeekLabels[w.weekLabel] && w.weekLabel !== win.weekLabel;
      });
      Logger.log('   ✓ Recovered ' + extraWeekly.length + ' extra week(s) from GitHub data.json');
    }
  } catch(e) { /* handled inside readCurrentDataFromGitHub */ }

  // ── 3. Current week entry ────────────────────────────────────
  var weekPlatforms = {};
  weekPlatforms.googleMaps = {
    count:   metrics.gmapsCount,
    avg:     parseFloat(metrics.gmapsAvg) || 0,
    fiveStar: metrics.guideStats.reduce(function(s,g){ return s + (g.gmapsFiveStar||0); }, 0)
  };
  weekPlatforms.tripAdvisor = {
    count:   metrics.taCount,
    avg:     parseFloat(metrics.taAvg) || 0,
    fiveStar: metrics.guideStats.reduce(function(s,g){ return s + (g.taFiveStar||0); }, 0)
  };
  // Add manual platform data
  if (metrics.manualByPlatform) {
    for (var plat in metrics.manualByPlatform) {
      var mp = metrics.manualByPlatform[plat];
      weekPlatforms[plat] = {
        count:   mp.count,
        avg:     mp.count > 0 ? parseFloat((mp.stars / mp.count).toFixed(2)) : null,
        fiveStar: mp.fiveStar
      };
    }
  }

  var currentWeekEntry = {
    weekLabel:    win.weekLabel,
    startDate:    win.startDateStr,
    endDate:      win.endDateStr,
    timestamp:    now.toISOString(),
    platforms:    weekPlatforms,
    totalReviews: metrics.combinedCount,
    totalBonus:   metrics.totalBonus,
    guides: metrics.guideStats
      .filter(function(g){ return g.name !== 'UNASSIGNED'; })
      .map(function(g){
        return { name:g.name, gmaps:g.gmaps, ta:g.ta, fiveStar:g.fiveStar, bonus:g.bonus,
                 gmapsFiveStar:g.gmapsFiveStar||0, taFiveStar:g.taFiveStar||0 };
      })
  };

  // ── 4. Merge all weekly entries ──────────────────────────────
  var weekMap = {};
  HISTORY_BASELINE_2026.weekly.forEach(function(w){ weekMap[w.weekLabel] = w; });
  extraWeekly.forEach(function(w){ weekMap[w.weekLabel] = w; });
  weekMap[win.weekLabel] = currentWeekEntry; // current week overwrites any existing entry

  var sortedWeekly = Object.keys(weekMap).map(function(k){ return weekMap[k]; });
  sortedWeekly.sort(function(a,b){ return b.startDate.localeCompare(a.startDate); }); // newest first

  // ── 5. Compute monthly aggregates ───────────────────────────
  //    Jan–Apr: from hardcoded baseline (per-platform breakdowns)
  //    May+: accumulated from weekly entries
  var monthlyMap = {};
  HISTORY_BASELINE_2026.monthly.forEach(function(m){
    monthlyMap[m.month] = JSON.parse(JSON.stringify(m));
  });

  sortedWeekly.forEach(function(w) {
    var month = w.startDate.substring(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = emptyMonthEntry(month);
    var mo = monthlyMap[month];
    mo.totalReviews += (w.totalReviews || 0);
    mo.totalBonus   += (w.totalBonus   || 0);
    if (w.platforms) {
      PLATFORM_DEFS.forEach(function(def) {
        var p = w.platforms[def.key];
        if (!p) return;
        if (!mo.platforms[def.key]) mo.platforms[def.key] = emptyPlatformSlot(def);
        mo.platforms[def.key].count   += (p.count    || 0);
        mo.platforms[def.key].fiveStar += (p.fiveStar || 0);
      });
    }
  });

  // Recompute monthly combined avg and platform avgs (we stored stars in baseline but need to
  // add week-level data which only has count+fiveStar; avg is best-effort from baseline)
  var monthKeys = [];
  for (var mi = 1; mi <= 12; mi++) {
    var mk = '2026-' + (mi < 10 ? '0' : '') + mi;
    if (!monthlyMap[mk]) monthlyMap[mk] = emptyMonthEntry(mk);
    monthKeys.push(mk);
  }
  var monthlyArr = monthKeys.map(function(k){ return monthlyMap[k]; });

  // ── 6. Compute YTD 2026 ──────────────────────────────────────
  //    Start from the hardcoded baseline YTD (covers everything through May 30).
  //    Then add only the extra + current weeks on top.
  var ytd = JSON.parse(JSON.stringify(HISTORY_BASELINE_2026.ytd2026));
  var extraAndCurrent = extraWeekly.concat([currentWeekEntry]);
  extraAndCurrent.forEach(function(w) {
    if (!w.platforms) return;
    var addedReviews = 0;
    PLATFORM_DEFS.forEach(function(def) {
      var p = w.platforms[def.key];
      if (!p || !p.count) return;
      if (!ytd.byPlatform[def.key]) {
        ytd.byPlatform[def.key] = { displayName:def.displayName, color:def.color, count:0, stars:0, fiveStar:0, avg:null };
      }
      ytd.byPlatform[def.key].count   += p.count;
      ytd.byPlatform[def.key].fiveStar += (p.fiveStar || 0);
      addedReviews += p.count;
    });
    ytd.combined.count      += (w.totalReviews || 0);
    ytd.combined.totalBonus += (w.totalBonus   || 0);
  });
  // Recompute combined avg (approximate — we don't have per-week stars for extra weeks)
  ytd.combined.avg = ytd.combined.count > 0
    ? parseFloat((ytd.combined.stars / ytd.combined.count).toFixed(2))
    : null;

  // ── 7. Compute byGuide ───────────────────────────────────────
  var byGuideMap = {};

  // Initialize from Jan–Apr baseline monthly data
  var baseGuide = HISTORY_BASELINE_2026.byGuide;
  for (var gname in baseGuide) {
    byGuideMap[gname] = { name:gname, active:true, ytdFiveStar:0, ytdBonus:0, monthlyFiveStar:{} };
    var mfs = baseGuide[gname].monthlyFiveStar || {};
    for (var mo in mfs) {
      byGuideMap[gname].monthlyFiveStar[mo] = mfs[mo];
      byGuideMap[gname].ytdFiveStar += mfs[mo];
    }
  }

  // Add from all weekly entries
  sortedWeekly.forEach(function(w) {
    var month = w.startDate.substring(0, 7);
    if (!w.guides) return;
    w.guides.forEach(function(g) {
      if (g.name === 'UNASSIGNED') return;
      if (!byGuideMap[g.name]) byGuideMap[g.name] = { name:g.name, active:true, ytdFiveStar:0, ytdBonus:0, monthlyFiveStar:{} };
      byGuideMap[g.name].ytdFiveStar += (g.fiveStar || 0);
      byGuideMap[g.name].ytdBonus    += (g.bonus    || 0);
      byGuideMap[g.name].monthlyFiveStar[month] =
        (byGuideMap[g.name].monthlyFiveStar[month] || 0) + (g.fiveStar || 0);
    });
  });

  // Ensure all current active guides appear
  guides.forEach(function(name) {
    if (!byGuideMap[name]) byGuideMap[name] = { name:name, active:true, ytdFiveStar:0, ytdBonus:0, monthlyFiveStar:{} };
  });

  var byGuideArr = Object.keys(byGuideMap).map(function(k){ return byGuideMap[k]; });
  byGuideArr.sort(function(a,b){ return b.ytdFiveStar - a.ytdFiveStar; });

  // ── 8. Assemble final JSON ───────────────────────────────────
  var output = {
    generatedAt:  now.toISOString(),
    year:         2026,
    weekLabel:    win.weekLabel,
    platforms:    PLATFORM_DEFS,
    activeGuides: guides,
    ytd2026:      ytd,
    current: {
      weekLabel: win.weekLabel,
      summary: {
        totalReviews: metrics.combinedCount,
        gmapsCount:   metrics.gmapsCount,
        gmapsAvg:     metrics.gmapsAvg,
        taCount:      metrics.taCount,
        taAvg:        metrics.taAvg,
        combinedAvg:  metrics.combinedAvg,
        totalBonus:   metrics.totalBonus
      },
      guides:     metrics.guideStats.filter(function(g){ return g.name !== 'UNASSIGNED'; }),
      lowRatings: metrics.lowRating
    },
    allTime: {
      googleMaps:   { count:running.gmaps.count,    avg:running.gmaps.avg    },
      tripAdvisor:  { count:running.ta.count,        avg:running.ta.avg       },
      combined:     { count:running.combined.count,  avg:running.combined.avg },
      averageRating: running.combined.avg,
      totalReviews:  running.combined.count
    },
    history: {
      monthly:  monthlyArr,
      weekly:   sortedWeekly,
      byGuide:  byGuideArr,
      notes:    'Jan–Apr 2026 from Reviews Tracker (hardcoded baseline). May onward from Apps Script. Bonus: $10 GMaps 5★, $5 TA 5★.'
    }
  };

  return JSON.stringify(output, null, 2);
}

// ==============================================================
// GITHUB PUSH
// ==============================================================

function pushToGitHub(jsonContent, C) {
  if (!C.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set in Script Properties');

  var apiUrl = 'https://api.github.com/repos/' + C.GITHUB_USERNAME + '/' + C.GITHUB_REPO + '/contents/' + C.GITHUB_FILE;
  var headers = {
    'Authorization': 'token ' + C.GITHUB_TOKEN,
    'Accept':        'application/vnd.github.v3+json',
    'User-Agent':    'AKWL-Engine'
  };

  var sha = null;
  try {
    var get = fetchWithRetry(apiUrl + '?ref=' + C.GITHUB_BRANCH, { headers:headers, muteHttpExceptions:true });
    if (get.getResponseCode() === 200) sha = JSON.parse(get.getContentText()).sha;
  } catch(e) { Logger.log('   (GET sha failed: ' + e.message + ')'); }

  var blob    = Utilities.newBlob(jsonContent, 'application/json', 'UTF-8');
  var encoded = Utilities.base64Encode(blob.getBytes());
  var payload = {
    message: 'chore: dashboard update — ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
    content: encoded,
    branch:  C.GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;

  var put  = fetchWithRetry(apiUrl, { method:'put', headers:headers, payload:JSON.stringify(payload), muteHttpExceptions:true });
  var code = put.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub push failed: HTTP ' + code + ' — ' + put.getContentText().substring(0, 300));
  }
  Logger.log('   ✓ data.json pushed to ' + C.GITHUB_BRANCH + ' branch');
}

// ==============================================================
// EMAIL
// ==============================================================

function createEmailDraftHTML(metrics, running, weekLabel, C) {
  var subject = 'AKWL Weekly Reviews — ' + weekLabel;
  var dashUrl = C.DASHBOARD_URL || 'https://alaskawildlights.github.io/akwl-reviews/';

  var bonus = metrics.guideStats.filter(function(g){ return g.bonus > 0; });
  var bonusRows = '';
  bonus.forEach(function(g) {
    bonusRows += '<tr><td style="padding:10px">' + g.name + '</td>' +
                 '<td style="text-align:center;padding:10px">' + g.gmaps + '</td>' +
                 '<td style="text-align:center;padding:10px">' + g.ta + '</td>' +
                 '<td style="text-align:center;padding:10px;font-weight:bold;color:#2e7d32">$' + g.bonus + '</td></tr>';
  });

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#333;background:#f5f5f5;margin:0;padding:20px}' +
    '.c{max-width:700px;margin:0 auto;background:#fff;padding:30px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1)}' +
    'h1{color:#0d47a1;margin:0 0 4px}' +
    '.wk{color:#666;font-size:14px;margin-bottom:20px}' +
    '.m{display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin:20px 0}' +
    '.mi{border:1px solid #ddd;padding:15px;border-radius:5px;background:#f9f9f9;text-align:center}' +
    '.mv{font-size:32px;font-weight:bold;color:#0d47a1;line-height:1}' +
    '.ml{font-size:11px;color:#999;text-transform:uppercase;margin-top:8px}' +
    '.ma{font-size:14px;color:#666;margin-top:5px}' +
    'table{width:100%;border-collapse:collapse;margin:20px 0}' +
    'th{background:#e8eef8;padding:12px;text-align:left;border-bottom:2px solid #0d47a1;color:#0d47a1;font-weight:bold}' +
    'td{padding:10px;border-bottom:1px solid #eee}' +
    'tr:last-child td{background:#e8eef8;font-weight:bold}' +
    'a{color:#0d47a1;text-decoration:none}' +
    '.sec{color:#0d47a1;font-size:16px;font-weight:bold;margin:25px 0 10px}' +
    '.info{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:15px 0;border-radius:4px}' +
    '.ok{background:#d4edda;border-left:4px solid #28a745;padding:15px;margin:15px 0;border-radius:4px}' +
    '.ft{font-size:12px;color:#999;margin-top:30px;padding-top:20px;border-top:1px solid #eee}' +
    '</style></head><body><div class="c">' +
    '<h1>🌌 Alaska Wild Lights</h1>' +
    '<div class="wk">Weekly Reviews — ' + weekLabel + '</div>' +
    '<div class="m">' +
    '<div class="mi"><div class="mv">' + metrics.gmapsCount + '</div><div class="ml">Google Maps</div><div class="ma">' + metrics.gmapsAvg + '★</div></div>' +
    '<div class="mi"><div class="mv">' + metrics.taCount + '</div><div class="ml">TripAdvisor</div><div class="ma">' + metrics.taAvg + '★</div></div>' +
    '<div class="mi"><div class="mv">' + metrics.combinedCount + '</div><div class="ml">Combined</div><div class="ma">' + metrics.combinedAvg + '★</div></div>' +
    '</div>' +
    '<div class="sec">All-Time Running Averages</div>' +
    '<table><tr><th>Platform</th><th style="text-align:center">Reviews</th><th style="text-align:center">Average</th></tr>' +
    '<tr><td>Google Maps</td><td style="text-align:center">' + running.gmaps.count + '</td><td style="text-align:center;font-weight:bold">' + running.gmaps.avg + '★</td></tr>' +
    '<tr><td>TripAdvisor</td><td style="text-align:center">' + running.ta.count + '</td><td style="text-align:center;font-weight:bold">' + running.ta.avg + '★</td></tr>' +
    '<tr><td><strong>Combined</strong></td><td style="text-align:center"><strong>' + running.combined.count + '</strong></td><td style="text-align:center;color:#0d47a1"><strong>' + running.combined.avg + '★</strong></td></tr>' +
    '</table>' +
    '<div class="sec">5★ Bonus Earners</div>' +
    '<p style="font-size:13px;color:#666">$10 per Google Maps review · $5 per TripAdvisor review</p>';

  if (bonus.length > 0) {
    html += '<table><tr><th>Guide</th><th style="text-align:center">Google</th><th style="text-align:center">TA</th><th style="text-align:center">Bonus</th></tr>' +
            bonusRows +
            '<tr><td><strong>TOTAL</strong></td><td style="text-align:center">—</td><td style="text-align:center">—</td><td style="text-align:center"><strong style="color:#2e7d32">$' + metrics.totalBonus + '</strong></td></tr></table>';
  } else {
    html += '<div class="ok">✓ No 5-star reviews this week</div>';
  }

  if (metrics.lowRating.length > 0) {
    html += '<div class="info">⚠️ <strong>' + metrics.lowRating.length + ' low-rating review(s)</strong> — see Flagged Reviews sheet</div>';
  } else {
    html += '<div class="ok">✓ No 1–2 star reviews this week</div>';
  }

  if (metrics.manualCount > 0) {
    html += '<div class="ok">📋 ' + metrics.manualCount + ' manual review(s) included from non-Apify platforms</div>';
  }

  html +=
    '<div class="sec">Quick Links</div>' +
    '<p><a href="' + dashUrl + '">📊 Dashboard</a> · ' +
    '<a href="' + C.WEEKLY_REVIEWS_URL + '">📋 Weekly Reviews</a> · ' +
    '<a href="' + C.FLAGGED_REVIEWS_URL + '">⚠️ Flagged</a> · ' +
    '<a href="' + C.EMPLOYEE_INFO_URL + '">👥 Team</a></p>' +
    '<div class="ft">Generated by AKWL Reviews Engine v5.0</div>' +
    '</div></body></html>';

  var plain = 'Weekly Reviews — ' + weekLabel + '\n\nView dashboard: ' + dashUrl;

  // Create a DRAFT for the team (send manually after review)
  GmailApp.createDraft(C.EMAIL_TO, subject, plain, {
    cc: C.EMAIL_CC,
    htmlBody: html,
    name: 'Alaska Wild Lights Reviews'
  });

  // Send a PREVIEW to ALERT_EMAIL (not for forwarding — see banner)
  var banner =
    '<div style="background:#fff3cd;border:2px solid #ffc107;padding:14px 18px;margin:0 0 18px 0;border-radius:6px;color:#5d4400;font-family:Arial,sans-serif;font-size:13px;line-height:1.5">' +
    '<strong>⚠️ ESTE ES UN PREVIEW. NO USES “REENVIAR/FORWARD”.</strong><br>' +
    'Para enviar al equipo: Gmail → Borradores → abrir el draft <em>"' + escapeHtmlGs(subject) + '"</em> → Enviar.' +
    '</div>';
  GmailApp.sendEmail(C.ALERT_EMAIL, '[PREVIEW] ' + subject, plain, {
    htmlBody: html.replace('<div class="c">', '<div class="c">' + banner),
    name: 'Alaska Wild Lights Reviews'
  });
}

function escapeHtmlGs(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==============================================================
// MAIN — runWeeklyReport()
// ==============================================================

function runWeeklyReport() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch(e) {
    Logger.log('⚠  Could not acquire lock — another run in progress. Aborting.');
    return;
  }

  var C = getConfig();
  try {
    Logger.log('');
    Logger.log('╔═══════════════════════════════════════════╗');
    Logger.log('║ AKWL Weekly Reviews Engine v5.0                ║');
    Logger.log('╚═══════════════════════════════════════════╝');
    Logger.log('');

    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('BOOTSTRAP_COMPLETED') !== 'true') {
      Logger.log('⚠️  BOOTSTRAP NOT INITIALIZED');
      Logger.log('   Run bootstrap_Initialize6MonthHistory() first, then re-schedule.');
      notifyFailure(C, 'Bootstrap missing', 'runWeeklyReport aborted. Run bootstrap_Initialize6MonthHistory() once.');
      return;
    }

    var win = getWeekWindow();
    Logger.log('📅 DATE WINDOW: ' + win.startDateStr + ' – ' + win.endDateStr);
    Logger.log('   Label: ' + win.weekLabel);
    Logger.log('');

    Logger.log('👥 Loading guides from sheet...');
    var guides = fetchGuideList(C);
    Logger.log('   ✓ ' + guides.length + ' guides: ' + guides.join(', '));
    Logger.log('');

    // ── Fetch platforms independently ─────────────────────────
    Logger.log('📡 Fetching reviews from Apify...');
    var gmapsRaw = [], taRaw = [], fetchErrors = [];

    try {
      gmapsRaw = fetchApifyReviews('gmaps', C, 50);
      Logger.log('   ✓ Google Maps: ' + gmapsRaw.length + ' reviews');
    } catch(e) {
      Logger.log('   ✗ Google Maps fetch failed: ' + e.message);
      fetchErrors.push('Google Maps: ' + e.message);
    }
    try {
      taRaw = fetchApifyReviews('tripadvisor', C, 50);
      Logger.log('   ✓ TripAdvisor: ' + taRaw.length + ' reviews');
    } catch(e) {
      Logger.log('   ✗ TripAdvisor fetch failed: ' + e.message);
      fetchErrors.push('TripAdvisor: ' + e.message);
    }
    Logger.log('');

    if (fetchErrors.length > 0) {
      notifyFailure(C, 'Apify scrape partial failure — ' + win.weekLabel,
        'One or more scrapes failed:\n\n' + fetchErrors.join('\n\n') + '\n\nReport continues with available data.');
    }

    if (gmapsRaw.length === 0 && taRaw.length === 0) {
      Logger.log('⛔ Both scrapes returned no data. Aborting.');
      notifyFailure(C, 'Weekly run aborted — ' + win.weekLabel, 'Both scrapes failed or returned 0 items.');
      return;
    }

    // ── Filter by date ────────────────────────────────────────
    Logger.log('🔍 FILTERING BY DATE:');
    var gmapsWeek = filterByDateRange(gmapsRaw, win.startDateStr, win.endDateStr, 'gmaps');
    Logger.log('   Google Maps in range: ' + gmapsWeek.length);
    var taWeek = filterByDateRange(taRaw, win.startDateStr, win.endDateStr, 'tripadvisor');
    Logger.log('   TripAdvisor in range: ' + taWeek.length);
    Logger.log('');

    // ── Manual reviews ────────────────────────────────────────
    Logger.log('📋 Fetching manual reviews...');
    var manualWeek = [];
    try {
      manualWeek = fetchManualReviews(win.startDateStr, win.endDateStr, C);
    } catch(e) {
      Logger.log('   ⚠  Manual reviews fetch failed: ' + e.message);
    }
    Logger.log('');

    // ── Match + calculate ─────────────────────────────────────
    Logger.log('🎯 MATCHING TO GUIDES:');
    var allReviews = gmapsWeek.concat(taWeek).concat(manualWeek);
    var matched = matchReviewsToGuides(allReviews, guides);
    Logger.log('   Total matched: ' + matched.length);
    Logger.log('');

    var metrics = calculateMetrics(matched, guides, gmapsWeek, taWeek, manualWeek);

    // ── Dedup for running state ───────────────────────────────
    Logger.log('🧹 DEDUP (running state only):');
    var seenSet = {};
    getSeenReviewKeys().forEach(function(k){ seenSet[k] = true; });
    var gmapsFresh = dedupReviews(gmapsWeek, seenSet);
    var taFresh    = dedupReviews(taWeek, seenSet);
    Logger.log('   Google Maps fresh: ' + gmapsFresh.length + '/' + gmapsWeek.length);
    Logger.log('   TripAdvisor fresh: ' + taFresh.length + '/' + taWeek.length);
    Logger.log('');

    var running = computeRunningState(gmapsFresh, taFresh);

    // ── Update sheets ─────────────────────────────────────────
    Logger.log('📝 Updating sheets...');
    updateWeeklyReviewsTab(C, metrics, guides, win.sundayLabel);
    updateFlaggedReviewsTab(C, metrics, win.weekLabel);
    Logger.log('   ✓ Sheets updated');
    Logger.log('');

    // ── Push to GitHub ────────────────────────────────────────
    Logger.log('💾 Building dashboard JSON + pushing to GitHub...');
    var jsonData = buildDashboardJSON(metrics, win, guides, running, C);
    pushToGitHub(jsonData, C);
    Logger.log('');

    // ── Email ─────────────────────────────────────────────────
    Logger.log('📧 Creating team draft + sending preview...');
    createEmailDraftHTML(metrics, running, win.weekLabel, C);
    Logger.log('   ✓ Draft created + preview sent to ' + C.ALERT_EMAIL);
    Logger.log('');

    // ── Persist state LAST (so partial failures don't advance totals) ─
    persistRunningState(running);
    saveSeenReviewKeys(Object.keys(seenSet));
    Logger.log('💾 Running state + seen-keys persisted.');
    Logger.log('');

    Logger.log('╔═══════════════════════════════════════════╗');
    Logger.log('║     ✅ COMPLETED SUCCESSFULLY                  ║');
    Logger.log('╚═══════════════════════════════════════════╝');
    Logger.log('');
    Logger.log('📊 THIS WEEK: ' + metrics.gmapsCount + ' GMaps, ' + metrics.taCount + ' TA, ' + metrics.manualCount + ' manual, $' + metrics.totalBonus + ' bonus');
    Logger.log('🔢 ALL-TIME: GMaps ' + running.gmaps.avg + '★ (' + running.gmaps.count + '), TA ' + running.ta.avg + '★ (' + running.ta.count + '), Combined ' + running.combined.avg + '★ (' + running.combined.count + ')');
    Logger.log('');

  } catch(e) {
    Logger.log('💥 Unhandled error: ' + e.message);
    Logger.log(e.stack || '(no stack)');
    notifyFailure(C, 'Unhandled error during weekly run',
      'runWeeklyReport threw an unhandled error:\n\n' + e.message + '\n\nStack:\n' + (e.stack || '(no stack)') +
      '\n\nCumulative state was NOT advanced.');
    throw e;
  } finally {
    lock.releaseLock();
  }
}

// ==============================================================
// BOOTSTRAP — run ONCE before scheduling the weekly trigger
// ==============================================================

// Run this function ONCE from the Apps Script editor to seed
// the all-time running state from the existing review history.
// After it runs, set up the weekly Monday 6 AM trigger.
function bootstrap_Initialize6MonthHistory() {
  Logger.log('');
  Logger.log('╔═══════════════════════════════════════════╗');
  Logger.log('║   BOOTSTRAP: Initialize Running State           ║');
  Logger.log('╚═══════════════════════════════════════════╝');

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

  var gmapsCount = 0, gmapsStars = 0;
  gmapsAll.forEach(function(r) {
    var rat = parseInt(r.stars || r.rating || 0);
    if (rat > 0) { gmapsCount++; gmapsStars += rat; }
  });
  var taCount = 0, taStars = 0;
  taAll.forEach(function(r) {
    var rat = parseInt(r.rating || r.bubbleRating || 0);
    if (rat > 0) { taCount++; taStars += rat; }
  });

  props.setProperty('BOOTSTRAP_GMAPS_COUNT', gmapsCount.toString());
  props.setProperty('BOOTSTRAP_GMAPS_STARS', gmapsStars.toString());
  props.setProperty('BOOTSTRAP_TA_COUNT',    taCount.toString());
  props.setProperty('BOOTSTRAP_TA_STARS',    taStars.toString());
  props.setProperty('BOOTSTRAP_COMPLETED',   'true');

  var seedKeys = [];
  gmapsAll.forEach(function(r){ seedKeys.push(reviewKey(r)); });
  taAll.forEach(function(r){ seedKeys.push(reviewKey(r)); });
  saveSeenReviewKeys(seedKeys);

  Logger.log('💾 Saved bootstrap state:');
  Logger.log('   Google Maps: ' + gmapsCount + ' reviews, ' + gmapsStars + ' stars, avg ' + (gmapsCount ? (gmapsStars/gmapsCount).toFixed(2) : 'N/A') + '★');
  Logger.log('   TripAdvisor: ' + taCount + ' reviews, ' + taStars + ' stars, avg ' + (taCount ? (taStars/taCount).toFixed(2) : 'N/A') + '★');
  Logger.log('   Seeded SEEN_REVIEW_IDS with ' + seedKeys.length + ' keys');
  Logger.log('');
  Logger.log('✅ Bootstrap complete. You can now schedule the weekly Monday trigger.');
}

// ==============================================================
// UTILITY — Add a week manually (without running Apify)
// ==============================================================

// Use this to backfill a week that the script missed.
// Fill in the values below, then run the function once from the editor.
function util_AddManualWeek() {
  // ── EDIT THESE VALUES BEFORE RUNNING ──────────────────────
  var WEEK_LABEL   = 'Jun 1 – Jun 7, 2026';
  var START_DATE   = '2026-06-01';
  var END_DATE     = '2026-06-07';
  var GMAPS_COUNT  = 0;
  var GMAPS_AVG    = 0;
  var GMAPS_5STAR  = 0;
  var TA_COUNT     = 0;
  var TA_AVG       = 0;
  var TA_5STAR     = 0;
  var TOTAL_BONUS  = 0;
  var GUIDE_STATS  = [
    // { name:'Shannon Williams', gmaps:0, ta:0, fiveStar:0, bonus:0, gmapsFiveStar:0, taFiveStar:0 }
  ];
  // ──────────────────────────────────────────────────────────

  var C = getConfig();
  var guides = fetchGuideList(C);

  var fakemetrics = {
    guideStats:      GUIDE_STATS,
    lowRating:       [],
    gmapsCount:      GMAPS_COUNT,
    taCount:         TA_COUNT,
    manualCount:     0,
    combinedCount:   GMAPS_COUNT + TA_COUNT,
    gmapsAvg:        GMAPS_AVG.toString(),
    taAvg:           TA_AVG.toString(),
    combinedAvg:     ((GMAPS_COUNT + TA_COUNT) > 0 ? ((GMAPS_COUNT * GMAPS_AVG + TA_COUNT * TA_AVG) / (GMAPS_COUNT + TA_COUNT)).toFixed(1) : 'N/A'),
    totalBonus:      TOTAL_BONUS,
    totalFiveStar:   GMAPS_5STAR + TA_5STAR,
    manualByPlatform: {}
  };

  var fakeWin = { weekLabel:WEEK_LABEL, startDateStr:START_DATE, endDateStr:END_DATE, sundayLabel:'' };
  var running = computeRunningState([], []); // reads current persisted state

  var jsonData = buildDashboardJSON(fakemetrics, fakeWin, guides, running, C);
  pushToGitHub(jsonData, C);
  Logger.log('✅ util_AddManualWeek: pushed ' + WEEK_LABEL);
}
