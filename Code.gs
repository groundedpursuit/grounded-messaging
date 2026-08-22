function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'gemini') {
    try {
      if (!underDailyCeiling_()) throw new Error('Daily AI ceiling reached.');
      var text = callGeminiProxy(e.parameter.prompt || '', e.parameter.tier || '', e.parameter.temp);
      var payload = JSON.stringify({ text: text });
      var cb = e.parameter.callback;
      var output = cb ? cb + '(' + payload + ')' : payload;
      var mime = cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
      return ContentService.createTextOutput(output).setMimeType(mime);
    } catch(err) {
      var errPayload = JSON.stringify({ error: err.message });
      var cb2 = e.parameter.callback;
      var output2 = cb2 ? cb2 + '(' + errPayload + ')' : errPayload;
      var mime2 = cb2 ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
      return ContentService.createTextOutput(output2).setMimeType(mime2);
    }
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Grounded Text Simulator (Offline)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

function callGeminiProxy(prompt, tier, temp) {
  var response = fetchGeminiText(prompt, tier, temp);
  var code = response.getResponseCode();
  if (isFastTier(tier) && (code === 429 || code === 503)) {
    response = fetchGeminiText(prompt, 'standard', temp);
    code = response.getResponseCode();
  }
  if (code !== 200) throw new Error('Gemini error ' + code + ': ' + response.getContentText());
  var data = JSON.parse(response.getContentText());
  return (data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text) || '';
}

function fetchGeminiText(prompt, tier, temp) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties.');
  var model = getGeminiModelForTier(tier);
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(buildGeminiPayload(prompt, null, tier, temp)),
    muteHttpExceptions: true
  });
}

function getGeminiModelForTier(tier) {
  return isFastTier(tier)
    ? 'gemini-2.5-flash-lite'
    : 'gemini-2.5-flash';
}

function isFastTier(tier) {
  return String(tier || '').toLowerCase() === 'fast';
}

function buildGeminiPayload(prompt, imagePart, tier, temp) {
  var parts = [{ text: prompt }];
  if (imagePart) parts.push(imagePart);

  var generationConfig = {
    temperature: clampTemp_(temp),
    topP: 0.8
  };

  if (isFastTier(tier) && !imagePart) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  if (expectsJsonResponse(prompt)) {
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

function expectsJsonResponse(prompt) {
  return /return\s+(valid\s+)?json\s+only/i.test(String(prompt || ''));
}

function setGeminiApiKeyFromCi(apiKey) {
  var value = String(apiKey || '').trim();
  if (!value) throw new Error('GEMINI_API_KEY value is required.');

  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', value);
  return { ok: true, property: 'GEMINI_API_KEY' };
}

function callGeminiWithImageProxy(prompt, mimeType, imageBase64) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties.');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(buildGeminiPayload(prompt, { inline_data: { mime_type: mimeType, data: imageBase64 } })),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) throw new Error('Gemini error ' + code + ': ' + response.getContentText());
  var data = JSON.parse(response.getContentText());
  return (data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text) || '';
}
