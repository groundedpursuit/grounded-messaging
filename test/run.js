// Regression tests for the parts of the app that have broken before.
// No dependencies: node test/run.js
const { loadApp } = require('./harness.js');

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; return; }
  failures.push(label + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual));
}

function section(name) { console.log('\n' + name); }

// ---------------------------------------------------------------- grading ---
section('grader: local (offline) grading');
{
  const { app } = loadApp();
  const scen = app.pools.wife.find(s => s.id === 'attack');
  app.setState({ practicePerson: 'wife', wifePersona: 'pursuer', activeScenario: scen });

  const grade = text => { app.fns.analyzeResponseLocal(text); return app.getState().lastGrade; };

  const cases = [
    // Non-apologies. "sorry" is a green flag, so these used to grade green on
    // that one word alone.
    ['non-apology: sorry you feel that way', "I'm sorry you feel that way.", 'red'],
    ['non-apology: sorry if you took it', "Sorry if you took it that way.", 'red'],
    ['non-apology: sorry but', "Sorry but you never let me finish.", 'red'],
    ['dismissal: dramatic', "You are being ridiculous and dramatic right now", 'red'],
    ['dismissal: overreacting', "You're overreacting again.", 'red'],
    ['dismissal: not what I said', "That's not what I said.", 'red'],
    ['dismissal: so sensitive', "You are being so sensitive about this.", 'red'],
    ['dismissal: get over it', "Just get over it already.", 'red'],

    // Contempt and shutdown.
    ['hard red: name calling', "You're being an idiot about this.", 'red'],
    ['hard red: crazy', "You're crazy.", 'red'],
    ['hard red: calm down', "Calm down.", 'red'],
    ['shutdown: leave me alone', "Leave me alone.", 'red'],
    ['shutdown: whatever', "Whatever.", 'red'],
    ['defensive: you always', "You always do this.", 'red'],

    // Green work. These are the ones that regressed when flags were matched as
    // bare substrings: "wrong" inside "I was wrong", "never" inside "I never
    // really listen", "i did" inside "I didn't".
    ['green: owns it', "You're right, I wasn't listening. Say it again and I'm here.", 'green'],
    ['green: validates feeling', "I hear you. That sounds really frustrating and I get why you're upset.", 'green'],
    ['word boundary: I was wrong', "I was wrong. I'm sorry.", 'green'],
    ['word boundary: I did not mean it', "I didn't mean it that way, but I hear that it landed badly.", 'green'],
    ['word boundary: I never really listen', "I never really listen when you need me. That's on me.", 'green'],
    ['green: real apology + validation', "I'm sorry. That must feel awful and you shouldn't be carrying it alone.", 'green'],
    ['green: my bad + repair', "My bad, I got distracted. Tell me again and I'm actually here.", 'green'],

    // Middling.
    ['yellow: too short to say anything', "ok", 'yellow'],
    ['yellow: bare request for space', "I need space.", 'yellow']
  ];
  for (const [label, text, expected] of cases) check(label, grade(text), expected);
}

section('grader: secure timeout ladder');
{
  const { app } = loadApp();
  const scen = app.pools.wife.find(s => s.id === 'attack');
  app.setState({ practicePerson: 'wife', wifePersona: 'pursuer', activeScenario: scen });
  const grade = text => { app.fns.analyzeResponseLocal(text); return app.getState().lastGrade; };

  // Green needs all three: validation, a named limit, and a return plan.
  check('timeout: validation + limit + return',
    grade("I hear you, and I'm too flooded to do this well. Give me 20 minutes and I'll come back to it."), 'green');
  check('timeout: makes sense + minute + tonight',
    grade("That makes sense. I need a minute to cool down, then I'll come back to this tonight."), 'green');
  check('timeout: understand + overwhelmed + later',
    grade("I understand. I'm overwhelmed right now, so give me a moment and we can talk later."), 'green');
  check('timeout: limit with no validation stays yellow',
    grade("I'm too flooded to do this well right now. Give me 20 minutes and I'll come back to it."), 'yellow');
  check('timeout: validation with no return plan stays yellow',
    grade("I hear you. I need a break."), 'yellow');
  check('timeout: abandonment is not a boundary',
    grade("I'm done. Leave me alone."), 'red');
}

section('grader: flag matching is word-bounded');
{
  const { app } = loadApp();
  const m = app.fns.matchesFlag;
  check('matches whole word', m("you never listen", "you never"), true);
  check('does not match inside a word', m("i was wrong about that", "wrong"), true);
  check('curly apostrophe still matches', m("that’s wrong", "that's wrong"), true);
  check('substring alone does not match', m("i didn't answer", "i did"), false);
  check('empty flag never matches', m("anything", ""), false);
}

// ------------------------------------------------------------------ boot ----
section('boot: storage failures do not kill the app');
{
  // A WebView with storage blocked used to throw at the top level of the
  // script, and the whole app booted to a blank screen.
  let threw = null;
  try { loadApp({ blockStorage: true }); } catch (e) { threw = e.message; }
  check('app evaluates with localStorage throwing', threw, null);

  const { app } = loadApp({ blockStorage: true });
  check('toggle still has a value', typeof app.showGroundedResponse, 'boolean');
  let setThrew = null;
  try { app.fns.setGroundedResponse(false); } catch (e) { setThrew = e.message; }
  check('writing the toggle does not throw', setThrew, null);
}

section('settings: grounded-response toggle persists');
{
  // Two setters wrote two encodings ('true'/'false' and '1'/'0') for one flag,
  // and the reader understood only one of them, so the setting never survived
  // a reload.
  const a = loadApp();
  a.app.fns.setGroundedResponse(false);
  check('off is written as 0', a.sandbox.__store.get('showGroundedResponse'), '0');
  check('off is reflected in state', a.app.showGroundedResponse, false);

  const b = loadApp({ storage: { showGroundedResponse: '0' } });
  check('reload reads back off', b.app.showGroundedResponse, false);

  const c = loadApp({ storage: { showGroundedResponse: '1' } });
  check('reload reads back on', c.app.showGroundedResponse, true);

  // Values written by the old build still have to be understood.
  const d = loadApp({ storage: { showGroundedResponse: 'false' } });
  check('legacy "false" still reads as off', d.app.showGroundedResponse, false);

  const e = loadApp({ storage: { showGroundedResponse: 'true' } });
  check('legacy "true" still reads as on', e.app.showGroundedResponse, true);

  const f = loadApp();
  check('default is on', f.app.showGroundedResponse, true);

  const g = loadApp();
  g.app.fns.toggleGroundedResponse();
  check('toggle flips to off', g.app.showGroundedResponse, false);
  g.app.fns.toggleGroundedResponse();
  check('toggle flips back on', g.app.showGroundedResponse, true);
  check('on is written as 1', g.sandbox.__store.get('showGroundedResponse'), '1');
}

// ------------------------------------------------------------- daily cap ----
section('daily cap: a failed request refunds the rep');
{
  const { app } = loadApp();
  const before = app.fns.aiRepsRemaining();
  app.fns.recordAiRep();
  check('spending a rep decrements', app.fns.aiRepsRemaining(), before - 1);
  app.fns.refundAiRep();
  check('refunding restores it', app.fns.aiRepsRemaining(), before);
  app.fns.refundAiRep();
  check('refund never goes below zero used', app.fns.aiRepsRemaining(), before);
}

// ---------------------------------------------------------------- escaping --
section('escaping: user text never reaches innerHTML raw');
{
  const { app } = loadApp();
  const esc = app.fns.escapeHtml;
  check('escapes angle brackets', esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  check('escapes quotes', esc('say "hi"'), 'say &quot;hi&quot;');
  check('escapes ampersand first', esc('a & <b>'), 'a &amp; &lt;b&gt;');
  check('handles null', esc(null), '');
}

// ------------------------------------------------------------ scenario list --
section('scenario list: whole pool, stable order, searchable');
{
  const { app, sandbox } = loadApp();
  app.setState({ practicePerson: 'wife' });

  const rows = () => sandbox.__elements.get('scenario-list').children;
  const titles = () => rows()
    .map(el => (String(el.innerHTML).match(/<h3[^>]*>([^<]*)<\/h3>/) || [])[1])
    .filter(Boolean);

  app.fns.initScenarios();
  const first = titles();
  check('every scenario is listed (12 wife + daily)', first.length, app.pools.wife.length + 1);
  check('daily challenge is first', first[0], 'Daily Challenge');
  check('scenarios use their own names', first.slice(1), app.pools.wife.map(s => s.name));

  app.fns.initScenarios();
  check('order is stable across renders', titles(), first);

  sandbox.__elements.get('scenario-search').value = 'money';
  app.fns.initScenarios();
  const filtered = titles();
  check('search narrows the list', filtered.length < first.length, true);
  check('search hides the daily row', filtered.indexOf('Daily Challenge'), -1);
  check('search returns at least one match', filtered.length > 0, true);

  sandbox.__elements.get('scenario-search').value = 'zzzzz-no-such-scenario';
  app.fns.initScenarios();
  check('no matches renders no rows', titles().length, 0);

  sandbox.__elements.get('scenario-search').value = '';
  app.fns.initScenarios();
  check('clearing search restores the list', titles(), first);
}

// ------------------------------------------------------------------ report --
console.log('');
if (failures.length) {
  console.log(failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.forEach(f => console.log('  FAIL  ' + f));
  process.exit(1);
}
console.log(passed + ' passed');
