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
section('scenario list: three at a time, refresh cycles');
{
  const { app, sandbox } = loadApp();
  app.setState({ practicePerson: 'wife' });

  const titles = () => sandbox.__elements.get('scenario-list').children
    .map(el => (String(el.innerHTML).match(/<h3[^>]*>([^<]*)<\/h3>/) || [])[1])
    .filter(Boolean);
  const scenarios = () => titles().filter(t => t !== 'Daily Challenge');
  const search = q => { sandbox.__elements.get('scenario-search').value = q; app.fns.initScenarios(); };

  app.fns.initScenarios();
  const page1 = scenarios();
  check('shows three scenarios, not the whole pool', page1.length, 3);
  check('daily challenge sits above them', titles()[0], 'Daily Challenge');
  check('they are the first three in pool order', page1, app.pools.wife.slice(0, 3).map(s => s.name));

  // The old build reshuffled here, which is how you lost the one you were on.
  app.fns.initScenarios();
  app.fns.initScenarios();
  check('re-rendering does not change the three', scenarios(), page1);

  app.fns.cycleScenarios();
  const page2 = scenarios();
  check('refresh moves to the next three', page2, app.pools.wife.slice(3, 6).map(s => s.name));
  check('refresh shows a different set', page2.some(t => page1.includes(t)), false);
  check('and that set is then stable too', (app.fns.initScenarios(), scenarios()), page2);

  const seen = [...page1, ...page2];
  for (let i = 2; i < app.pools.wife.length / 3; i++) { app.fns.cycleScenarios(); seen.push(...scenarios()); }
  check('cycling reaches every scenario', seen.slice().sort(), app.pools.wife.map(s => s.name).sort());

  app.fns.cycleScenarios();
  check('and wraps back to the first three', scenarios(), page1);

  // Search is the escape hatch: it has to reach scenarios that are not on the
  // page currently showing.
  const offPage = app.pools.wife[9];
  search(offPage.name.toLowerCase());
  check('search finds a scenario from another page', scenarios(), [offPage.name]);
  check('search hides the daily row', titles().includes('Daily Challenge'), false);

  search('zzzz-nothing');
  check('no matches renders no scenarios', scenarios().length, 0);

  search('');
  check('clearing search restores the current three', scenarios(), page1);

  // Each person keeps their own place in their own pool.
  app.fns.cycleScenarios();
  const wifePage = app.fns.scenarioPageFor('wife');
  app.setState({ practicePerson: 'coworker' });
  check('a different person starts at their first three', app.fns.scenarioPageFor('coworker'), 0);
  app.setState({ practicePerson: 'wife' });
  check('and the first person keeps their place', app.fns.scenarioPageFor('wife'), wifePage);

  const persisted = loadApp({ storage: { gp_scenario_page_v1: JSON.stringify({ wife: 2 }) } });
  persisted.app.setState({ practicePerson: 'wife' });
  persisted.app.fns.initScenarios();
  const restored = persisted.sandbox.__elements.get('scenario-list').children
    .map(el => (String(el.innerHTML).match(/<h3[^>]*>([^<]*)<\/h3>/) || [])[1])
    .filter(Boolean).filter(t => t !== 'Daily Challenge');
  check('the page survives a reload', restored, app.pools.wife.slice(6, 9).map(s => s.name));
}

section('roleplay prompt: the other person keeps their own side of the fight');
{
  const { app } = loadApp();
  const scen = app.pools.family.find(s => s.id === 'fam_boundary');
  const setup = persona => app.setState({
    practicePerson: 'family', wifePersona: persona, activeScenario: scen,
    lastGrade: 'red', currentTranslation: scen.translation,
    chatHistory: [{ role: 'model', text: scen.initialText }, { role: 'user', text: "no i'm not" }]
  });

  // The coach note is advice for the USER ("Warm boundary = connection + limit").
  // Handed to the model playing the other person, it performed the advice: five
  // runs out of six replied "I'm not shutting you out, I just need space" - the
  // user's own line, from the character who had just made that accusation.
  setup('withdrawer');
  const roleplay = app.fns.buildReplyPrompt();
  const grading = app.fns.buildCombinedTurnPrompt(scen, "no i'm not");
  check('scenario has a coach note to leak', typeof scen.tips === 'string' && scen.tips.length > 0, true);
  check('the grading prompt keeps the coach note', grading.includes(scen.tips), true);
  check('the roleplay prompt does not', roleplay.includes(scen.tips), false);
  check('the roleplay prompt never carries the model answer', roleplay.includes(scen.perfectResponse), false);

  check('roleplay prompt states whose complaint it is', /WHOSE COMPLAINT IT IS/.test(roleplay), true);
  check('and forbids denying it back', /never says "I'm not that"|does not deny it back/.test(roleplay), true);

  // A withdrawer in a scenario where the OTHER person opened with a complaint
  // is a quieter version of that same person - not someone who now needs space.
  check('withdrawer keeps the complaint when the scenario is not a withdrawal',
    /do NOT ask for space/.test(roleplay), true);
  check('withdrawer is told volume changes, not side',
    /changes HOW MUCH the .* says, never what they want or who did what/.test(roleplay), true);

  setup('pursuer');
  const pursuing = app.fns.buildReplyPrompt();
  check('pursuer presses their own point rather than defending',
    /never start defending themselves against it/.test(pursuing), true);

  // A scenario that opens with the other person pulling away is the opposite
  // case, and still has to hold its posture.
  const shutdown = app.pools.wife.find(s => s.id === 'shutdown');
  check('the withdrawal scenario is still marked', shutdown.stance, 'withdraw');
  app.setState({
    practicePerson: 'wife', wifePersona: 'withdrawer', activeScenario: shutdown,
    lastGrade: 'red', currentTranslation: shutdown.translation,
    chatHistory: [{ role: 'model', text: shutdown.initialText }, { role: 'user', text: 'fine, be like that' }]
  });
  const withdrawn = app.fns.buildReplyPrompt();
  check('a withdrawing scenario says they stay pulled away', /stay in that posture/.test(withdrawn), true);
  check('and that they do not chase', /never chattier or chasing/.test(withdrawn), true);
  check('a withdrawing scenario does not get the keep-pressing rule',
    /do NOT ask for space/.test(withdrawn), false);
}

// ------------------------------------------------------------------ report --
console.log('');
if (failures.length) {
  console.log(failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.forEach(f => console.log('  FAIL  ' + f));
  process.exit(1);
}
console.log(passed + ' passed');
