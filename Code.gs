function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action === 'gemini') return geminiResponse_(params);

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Grounded Text Simulator (Offline)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// The client posts the prompt in the body instead of the query string. A GET
// carries the whole prompt in the URL, and the longest live prompts were
// within ~30% of the length limit, past which the request fails silently.
function doPost(e) {
  var params = (e && e.parameter) || {};
  return geminiResponse_(params);
}

function geminiResponse_(params) {
  var cb = params.callback;
  try {
    if (!underDailyCeiling_()) throw new Error('Daily AI ceiling reached.');
    var text = callGeminiProxy_(params.prompt || '', params.tier || '', params.temp);
    return jsonOut_({ text: text }, cb);
  } catch (err) {
    return jsonOut_({ error: err.message }, cb);
  }
}

function jsonOut_(obj, callback) {
  var payload = JSON.stringify(obj);
  var body = callback ? callback + '(' + payload + ')' : payload;
  var mime = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mime);
}

// The proxy is open to anyone holding the URL, so the client-side per-user cap
// cannot be the only guard. This is the hard ceiling on a day's spend.
var DAILY_GEMINI_CALL_CEILING = 4000;

function underDailyCeiling_() {
  var props = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  var lock = LockService.getScriptLock();
  var locked = false;
  try { locked = lock.tryLock(400); } catch (e) { locked = false; }

  try {
    var state = { day: day, count: 0 };
    try {
      var parsed = JSON.parse(props.getProperty('GEMINI_DAY_COUNT') || '{}');
      if (parsed && parsed.day === day) state = { day: day, count: Number(parsed.count) || 0 };
    } catch (e) {}

    if (state.count >= DAILY_GEMINI_CALL_CEILING) return false;
    props.setProperty('GEMINI_DAY_COUNT', JSON.stringify({ day: day, count: state.count + 1 }));
    return true;
  } finally {
    if (locked) lock.releaseLock();
  }
}

// Every helper below ends in an underscore. Apps Script exposes each top-level
// function without one to anonymous callers through google.script.run, so the
// naming is the access control, not decoration.
function callGeminiProxy_(prompt, tier, temp) {
  var response = fetchGeminiText_(prompt, tier, temp);
  var code = response.getResponseCode();
  if (isFastTier_(tier) && (code === 429 || code === 503)) {
    response = fetchGeminiText_(prompt, 'standard', temp);
    code = response.getResponseCode();
  }
  if (code !== 200) throw upstreamError_(code, response);
  var data = JSON.parse(response.getContentText());
  return readGeminiText_(data);
}

// The upstream body can carry quota details and request echoes, so it goes to
// the log rather than back to the browser.
function upstreamError_(code, response) {
  try { console.error('Gemini error ' + code + ': ' + response.getContentText()); } catch (e) {}
  return new Error('Gemini error ' + code);
}

function readGeminiText_(data) {
  return (data && data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text) || '';
}

function fetchGeminiText_(prompt, tier, temp) {
  var apiKey = geminiApiKey_();
  var model = getGeminiModelForTier_(tier);
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(buildGeminiPayload_(prompt, null, tier, temp)),
    muteHttpExceptions: true
  });
}

function geminiApiKey_() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties.');
  return apiKey;
}

function getGeminiModelForTier_(tier) {
  return isFastTier_(tier)
    ? 'gemini-2.5-flash-lite'
    : 'gemini-2.5-flash';
}

function isFastTier_(tier) {
  return String(tier || '').toLowerCase() === 'fast';
}

function buildGeminiPayload_(prompt, imagePart, tier, temp) {
  var parts = [{ text: prompt }];
  if (imagePart) parts.push(imagePart);

  var generationConfig = {
    temperature: clampTemp_(temp),
    topP: 0.8
  };

  if (isFastTier_(tier) && !imagePart) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  if (expectsJsonResponse_(prompt)) {
    generationConfig.responseMimeType = 'application/json';
  }

  return {
    contents: [{ parts: parts }],
    generationConfig: generationConfig
  };
}

function clampTemp_(temp) {
  var value = parseFloat(temp);
  if (isNaN(value)) return 0.25;
  return Math.min(1, Math.max(0, value));
}

function expectsJsonResponse_(prompt) {
  return /return\s+(valid\s+)?json\s+only/i.test(String(prompt || ''));
}

/**
 * Called by CI through the Apps Script API (clasp run), which is why it cannot
 * take an underscore. It has to prove who is calling instead: an Apps Script
 * API call runs as the authenticated owner, while a web-app visitor - the only
 * other way to reach a top-level function - has no active user at all.
 */
function setGeminiApiKeyFromCi(apiKey) {
  var activeUser = '';
  var effectiveUser = '';
  try { activeUser = String(Session.getActiveUser().getEmail() || ''); } catch (err) { activeUser = ''; }
  try { effectiveUser = String(Session.getEffectiveUser().getEmail() || ''); } catch (err) { effectiveUser = ''; }
  if (!activeUser || activeUser !== effectiveUser) {
    throw new Error('Not authorized.');
  }

  var value = String(apiKey || '').trim();
  if (!value) throw new Error('GEMINI_API_KEY value is required.');

  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', value);
  return { ok: true, property: 'GEMINI_API_KEY' };
}

// Unused by the current client, kept for the screenshot path. It skipped the
// daily ceiling entirely, so it was the one route to unmetered spend.
function callGeminiWithImageProxy_(prompt, mimeType, imageBase64) {
  if (!underDailyCeiling_()) throw new Error('Daily AI ceiling reached.');
  var apiKey = geminiApiKey_();
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(buildGeminiPayload_(prompt, { inline_data: { mime_type: mimeType, data: imageBase64 } })),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) throw upstreamError_(code, response);
  return readGeminiText_(JSON.parse(response.getContentText()));
}
