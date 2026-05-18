function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'gemini') {
    try {
      var text = callGeminiProxy(e.parameter.prompt || '');
      return ContentService.createTextOutput(JSON.stringify({ text: text }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
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
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) throw new Error('Gemini error ' + code + ': ' + response.getContentText());
  var data = JSON.parse(response.getContentText());
  return (data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text) || '';
}

function callGeminiWithImageProxy(prompt, mimeType, imageBase64) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties.');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }]
    }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) throw new Error('Gemini error ' + code + ': ' + response.getContentText());
  var data = JSON.parse(response.getContentText());
  return (data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text) || '';
}
