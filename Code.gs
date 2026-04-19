function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Grounded Text Simulator (Offline)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

