// Loads the app's inline <script> block in a headless VM with just enough DOM
// to let it evaluate, and hands back the internal functions worth testing.
// The app is one file with no build step, so this is the only way to test the
// grader without a browser.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.join(__dirname, '..', 'index.html');

function extractAppScript(html) {
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  if (!blocks.length) throw new Error('no inline <script> block found in index.html');
  return blocks.reduce((a, b) => (b.length > a.length ? b : a));
}

function makeElement(id) {
  const el = {
    id,
    value: '',
    innerText: '',
    className: '',
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    dataset: {},
    parentElement: null,
    children: [],
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, on) { if (on === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (on) { this._set.add(c); } else { this._set.delete(c); } },
      contains(c) { return this._set.has(c); }
    },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); return child; },
    remove() {},
    insertAdjacentHTML(pos, html) { this.innerHTML += html; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    blur() {},
    scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  // The real thing drops its children when innerHTML is cleared, and
  // initScenarios relies on that to rebuild the list.
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(value) { html = String(value); if (html === '') el.children = []; },
    enumerable: true,
    configurable: true
  });
  el.parentElement = { classList: Object.assign({}, el.classList, { _set: new Set() }) };
  return el;
}

function buildSandbox(options) {
  const opts = options || {};
  const elements = new Map();
  const store = new Map(Object.entries(opts.storage || {}));

  const localStorage = opts.blockStorage
    ? {
        getItem() { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; },
        setItem() { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; },
        removeItem() { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; }
      }
    : {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); }
      };

  const document = {
    documentElement: makeElement('html'),
    head: makeElement('head'),
    body: makeElement('body'),
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement: tag => makeElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };

  const sandbox = {
    console,
    document,
    localStorage,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Date, Math, JSON, RegExp, Error, URLSearchParams,
    navigator: { userAgent: 'node', onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/' },
    fetch: () => Promise.reject(new Error('network disabled in tests')),
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    requestAnimationFrame: cb => setTimeout(cb, 0),
    cancelAnimationFrame: id => clearTimeout(id),
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    visualViewport: null,
    __elements: elements,
    __store: store
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

// `const`/`let` at the top level of a vm script are script-scoped, not
// properties of the sandbox, so the values have to be handed out explicitly.
const EXPORTS = `
;globalThis.__app = {
  pools: scenarioPools,
  dailyPools: dailyScenarioPools,
  flags: { hardRedFlags, universalRedFlags, universalGreenFlags, invalidatingPhrases },
  get showGroundedResponse() { return showGroundedResponse; },
  setState(s) {
    if (s.currentTranslation !== undefined) currentTranslation = s.currentTranslation;
    if (s.chatHistory !== undefined) chatHistory = s.chatHistory;
    if (s.practicePerson !== undefined) practicePerson = s.practicePerson;
    if (s.wifePersona !== undefined) wifePersona = s.wifePersona;
    if (s.activeScenario !== undefined) activeScenario = s.activeScenario;
    if (s.lastGrade !== undefined) lastGrade = s.lastGrade;
  },
  getState() { return { practicePerson, lastGrade, activeScenario }; },
  fns: {
    analyzeResponseLocal, assessSecureBoundary, matchesFlag, polishGroundedResponse,
    escapeHtml, initScenarios, cycleScenarios, scenarioPageFor, scenarioPageCount,
    buildReplyPrompt, buildCombinedTurnPrompt, parseGeminiJson,
    replyProblem, lineSimilarity, accusationStems, claimWords, denialFragments,
    resolveReply, scriptedReplyJson, samePoint, repeatNote, roleSwapNote,
    setGroundedResponse, toggleGroundedResponse,
    recordAiRep, refundAiRep, aiRepsRemaining, loadAiUsage
  }
};
`;

function loadApp(options) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const code = extractAppScript(html) + EXPORTS;
  const sandbox = buildSandbox(options);
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'index.html<script>' });
  return { sandbox, app: sandbox.__app };
}

module.exports = { loadApp, extractAppScript, INDEX };
