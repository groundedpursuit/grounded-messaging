// Parses every piece of JavaScript that ships, so a syntax error cannot reach
// production. A single bad character in the inline <script> takes down the
// whole app: nothing after it runs and the screen comes up blank.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractAppScript } = require('./harness.js');

const root = path.join(__dirname, '..');
let failed = 0;

function parse(label, code) {
  try {
    new vm.Script(code, { filename: label });
    console.log('  ok    ' + label + ' (' + code.length + ' chars)');
  } catch (e) {
    failed++;
    console.log('  FAIL  ' + label + ': ' + e.message);
  }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, i = 0;
while ((m = re.exec(html)) !== null) parse('index.html inline script #' + (++i), m[1]);
if (i === 0) { failed++; console.log('  FAIL  index.html has no inline script'); }

parse('Code.gs', fs.readFileSync(path.join(root, 'Code.gs'), 'utf8'));
parse('sw.js', fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));

// The app script has to be the one the harness picks up, or the tests are
// silently checking the wrong block.
const app = extractAppScript(html);
if (app.length < 100000) { failed++; console.log('  FAIL  app script is only ' + app.length + ' chars - wrong block?'); }

// Every top-level Apps Script function without a trailing underscore is
// callable by anonymous visitors through google.script.run.
const gs = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
const exposed = (gs.match(/^function\s+([A-Za-z0-9_]+)/gm) || [])
  .map(s => s.replace(/^function\s+/, ''))
  .filter(n => !n.endsWith('_'));
const allowed = ['doGet', 'doPost', 'setGeminiApiKeyFromCi'];
const unexpected = exposed.filter(n => allowed.indexOf(n) === -1);
if (unexpected.length) {
  failed++;
  console.log('  FAIL  Code.gs exposes ' + unexpected.join(', ') + ' to anonymous callers - add a trailing underscore');
} else {
  console.log('  ok    Code.gs exposes only ' + exposed.join(', '));
}

process.exit(failed ? 1 : 0);
