function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'gemini') {
    try {
      var text = callGeminiProxy(e.parameter.prompt || '');
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
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Grounded Text Simulator (Offline)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function callGeminiProxy(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties.');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(buildGeminiPayload(prompt)),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) throw new Error('Gemini error ' + code + ': ' + response.getContentText());
  var data = JSON.parse(response.getContentText());
  return (data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text) || '';
}

function buildGeminiPayload(prompt, imagePart) {
  var parts = [{ text: prompt }];
  if (imagePart) parts.push(imagePart);

  var generationConfig = {
    temperature: 0.25,
    topP: 0.8,
    maxOutputTokens: 420
  };

  if (expectsJsonResponse(prompt)) {
    generationConfig.responseMimeType = 'application/json';
  }

  return {
    contents: [{ parts: parts }],
    generationConfig: generationConfig
  };
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
