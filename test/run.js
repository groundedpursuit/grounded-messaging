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

// ------------------------------------------------------- reply integrity ---
section('reply integrity: the checks that run before a reply is shown');
{
  const { app } = loadApp();
  const boundary = app.pools.family.find(s => s.id === 'fam_boundary');
  const intimacy = app.pools.wife.find(s => s.id === 'intimacy');
  const space = app.pools.girlfriend.find(s => s.id === 'gf_space');

  const state = (scen, history, persona) => app.setState({
    practicePerson: scen === boundary ? 'family' : (scen === space ? 'girlfriend' : 'wife'),
    wifePersona: persona || 'withdrawer', activeScenario: scen, lastGrade: 'red',
    currentTranslation: scen.translation, chatHistory: history
  });
  const kind = reply => { const p = app.fns.replyProblem(reply); return p ? p.kind : 'clean'; };

  // The reported bug: the family member accused the user of shutting them out,
  // the user denied it, and the reply denied it right back - the user's line.
  state(boundary, [{ role: 'model', text: boundary.initialText }, { role: 'user', text: "no i'm not" }]);
  check('denying their own accusation is a role swap',
    kind("I'm not shutting you out. I just need some space to think."), 'role');
  check('holding the complaint is fine',
    kind("Then why does it feel like there is a wall up every time I ask?"), 'clean');
  check('handing the subject back is a role swap',
    kind("Can we just talk about this later? I need a minute."), 'role');
  check('parroting the user is a role swap', kind("no i'm not"), 'role');
  check('sending the opening text again is a repeat', kind(boundary.initialText), 'repeat');
  // Pressing the same point on the very next text is the design. Only the
  // wording of the opening text is off limits.
  check('pressing the opening complaint in new words is not',
    kind("You have been off for weeks and you keep telling me it is nothing."), 'clean');

  // The other half of the same rule: when the USER accuses them of something,
  // denying THAT is answering the user, not stealing their side.
  state(space, [
    { role: 'model', text: space.initialText },
    { role: 'user', text: 'why are you always pushing me away' }
  ]);
  check('denying what the user accused them of is allowed',
    kind("I'm not pushing you away. I asked for ten minutes."), 'clean');
  check('and a withdrawing scenario may still ask for space',
    kind("Some space until tomorrow, then we can get into it."), 'clean');

  // "You are not listening WHEN I say I am not in the mood" accuses the user of
  // not listening and says nothing about moods, so restating the mood is not a
  // denial of their own complaint.
  state(intimacy, [{ role: 'model', text: intimacy.initialText }, { role: 'user', text: "you're overreacting" }]);
  check('restating their own position is not a swap',
    kind("You are not hearing me when I say I'm not in the mood."), 'clean');

  // Repetition, which only counts inside one conversation.
  const said = "It feels like I am the only one who tries to keep this family together.";
  state(boundary, [
    { role: 'model', text: boundary.initialText },
    { role: 'user', text: 'i said nothing is wrong' },
    { role: 'model', text: said },
    { role: 'user', text: 'you do the same thing' }
  ]);
  check('sending the same line twice is a repeat', kind(said), 'repeat');
  check('the same point in new words is a repeat',
    kind("Keeping this family together always falls to me, nobody else even tries."), 'repeat');
  check('opening with the same three words is a repeat',
    kind("It feels like nobody in this house tells me anything anymore."), 'repeat');
  check('a genuinely new line passes',
    kind("Mom asked about you on Sunday and I had nothing to tell her."), 'clean');

  check('an empty reply never reaches the screen', kind(''), 'role');
}

// ---------------------------------------------------------- reply prompt ----
section('reply prompt: position, already-said and rejection blocks');
{
  const { app } = loadApp();
  const scen = app.pools.wife.find(s => s.id === 'attack');
  const earlier = "You said you would call the plumber three weeks ago.";
  app.setState({
    practicePerson: 'wife', wifePersona: 'pursuer', activeScenario: scen, lastGrade: 'red',
    currentTranslation: scen.translation,
    chatHistory: [
      { role: 'model', text: scen.initialText },
      { role: 'user', text: 'i do listen' },
      { role: 'model', text: earlier },
      { role: 'user', text: 'that is not fair' }
    ]
  });

  const prompt = app.fns.buildReplyPrompt();
  check('the prompt names whose complaint this is', /YOUR POSITION: you are the wife/.test(prompt), true);
  check('and quotes the text they opened with', prompt.includes(scen.initialText.slice(0, 40)), true);
  check('the prompt lists what they already sent', prompt.includes(earlier), true);
  check('and tells them to keep their side while moving',
    /moving does not mean dropping the complaint/.test(prompt), true);
  check('a first draft carries no rejection block', /FIRST DRAFT WAS REJECTED/.test(prompt), false);

  const retry = app.fns.buildReplyPrompt({ kind: 'repeat', note: 'Say something new.', reply: earlier });
  check('a retry quotes the rejected draft', retry.includes(earlier), true);
  check('and gives the reason', retry.includes('Say something new.'), true);
}

// --------------------------------------------------------- retry policy -----
async function policyTests() {
  section('retry policy: one regeneration, then the scripted line');
  const { app } = loadApp();
  const scen = app.pools.family.find(s => s.id === 'fam_boundary');
  const swap = "I'm not shutting you out. I just need some space to think.";
  const good = "You have been distant for weeks and I am tired of guessing why.";
  const setup = history => app.setState({
    practicePerson: 'family', wifePersona: 'withdrawer', activeScenario: scen, lastGrade: 'red',
    currentTranslation: scen.translation,
    chatHistory: history || [
      { role: 'model', text: scen.initialText },
      { role: 'user', text: "no i'm not" }
    ]
  });

  setup();
  let calls = [];
  let out = await app.fns.resolveReply(p => { calls.push(p); return Promise.resolve({ reply: good }); });
  check('a clean draft is used as written', out.reply, good);
  check('and costs one call', calls.length, 1);

  setup();
  calls = [];
  out = await app.fns.resolveReply(p => {
    calls.push(p);
    return Promise.resolve({ reply: calls.length === 1 ? swap : good });
  });
  check('a role swap is regenerated', calls.length, 2);
  check('and the clean second draft is used', out.reply, good);
  check('the retry is told what was wrong', calls[1].kind, 'role');
  check('and carries the rejected draft', calls[1].reply, swap);

  setup();
  calls = [];
  out = await app.fns.resolveReply(p => { calls.push(p); return Promise.resolve({ reply: swap }); });
  check('two bad drafts stop at two calls', calls.length, 2);
  check('and fall back to the scenario line', out.reply, scen.followUp.red);

  // When the scripted line is itself already spent, the second draft is all
  // that is left - falling back would just repeat the conversation.
  setup([
    { role: 'model', text: scen.initialText },
    { role: 'model', text: scen.followUp.red },
    { role: 'user', text: "no i'm not" }
  ]);
  out = await app.fns.resolveReply(() => Promise.resolve({ reply: swap }));
  check('a spent scenario line is not reused', out.reply, swap);

  setup();
  calls = [];
  out = await app.fns.resolveReply(p => {
    calls.push(p);
    return calls.length === 1 ? Promise.resolve({ reply: swap }) : Promise.reject(new Error('network'));
  });
  check('a failed retry keeps the first draft rather than nothing', out.reply, swap);
}

// ------------------------------------------------- grounded response spine --
section('grounded response: warmth with a spine, not appeasement');
{
  const { app } = loadApp();
  const scen = app.pools.wife.find(s => s.id === 'attack');
  const setup = userText => {
    app.setState({
      practicePerson: 'wife', wifePersona: 'pursuer', activeScenario: scen, lastGrade: 'yellow',
      currentTranslation: scen.translation,
      chatHistory: [{ role: 'model', text: scen.initialText }, { role: 'user', text: userText }]
    });
    return app.fns.buildCombinedTurnPrompt(scen, userText);
  };

  const disputes = "i did do it though. you're not remembering it right.";
  const limit = "i'm too heated to do this right now. give me twenty minutes and i'll come back.";
  const dismiss = "whatever. you always find something to be mad about.";
  const plain = "that sounds really hard and i want to understand it.";

  check('a denial reads as disputing the facts', app.fns.readUserStance(disputes).disputes, true);
  check('asking for twenty minutes reads as a limit', app.fns.readUserStance(limit).limit, true);
  check('"whatever" reads as brushing them off', app.fns.readUserStance(dismiss).dismisses, true);
  check('a plain reply is none of those', app.fns.readUserStance(plain), { disputes: false, limit: false, dismisses: false });

  const disputePrompt = setup(disputes);
  check('the answer is told not to concede a disputed fact',
    /does NOT agree that he did it and does NOT apologize for it/.test(disputePrompt), true);
  const limitPrompt = setup(limit);
  check("and to keep the user's limit in the answer",
    /That limit STAYS in the answer/.test(limitPrompt), true);
  const dismissPrompt = setup(dismiss);
  check('contempt gets the honest version, not grovelling',
    /Do not have him grovel/.test(dismissPrompt), true);
  check('a plain reply gets no stance note', /WHAT THE USER JUST DID/.test(setup(plain)), false);

  // The standing rules, which apply on every turn.
  check('grounded is separated from sorry', /Grounded is not the same as sorry/.test(disputePrompt), true);
  check('ownership is capped at one sentence', /One ownership sentence at most/.test(disputePrompt), true);
  check('self-erasure is named and banned', /No self-erasure/.test(disputePrompt), true);
  check('a limit has to leave a way back', /A limit always comes with a way back/.test(disputePrompt), true);
  check('firm is separated from cold', /Firm is not cold/.test(disputePrompt), true);

  // A man who just disputed the facts should not be handed "take ownership
  // immediately" as his opening move. Scenario id seeds the register pick, so
  // several scenarios sample several seeds.
  const ids = ['attack', 'overwhelm', 'money', 'parenting', 'roommate', 'inlaws', 'work', 'public'];
  let ownedAnyway = 0, apologyEnding = 0;
  ids.forEach(id => {
    const s2 = app.pools.wife.find(x => x.id === id);
    app.setState({
      practicePerson: 'wife', wifePersona: 'pursuer', activeScenario: s2, lastGrade: 'yellow',
      currentTranslation: s2.translation,
      chatHistory: [{ role: 'model', text: s2.initialText }, { role: 'user', text: disputes }]
    });
    const prompt = app.fns.buildCombinedTurnPrompt(s2, disputes);
    if (/take ownership immediately/.test(prompt)) ownedAnyway++;
    if (/end on the ownership itself/.test(prompt)) apologyEnding++;
  });
  check('a disputed turn never opens by taking the blame', ownedAnyway, 0);
  check('and never ends on it either', apologyEnding, 0);
}

section('grounded response: the scripted answers');
{
  const { app } = loadApp();
  const answers = [];
  [app.pools, app.dailyPools].forEach(pools => Object.keys(pools).forEach(p =>
    pools[p].forEach(s => answers.push({ id: p + '/' + s.id, text: s.perfectResponse }))));

  const APOLOGY_MARKERS = /\b(i'm sorry|i am sorry|sorry|my fault|my bad|that's on me|i was wrong|that was wrong|i let you down|i should have|i should've)\b/gi;
  const stacked = answers.filter(a => (String(a.text).match(APOLOGY_MARKERS) || []).length > 2);
  check('no scripted answer stacks three apologies', stacked.map(a => a.id), []);

  const erasing = answers.filter(a => /you matter more than|i don't deserve|whatever you want me to be/i.test(a.text));
  check('none trades the user away to end the fight', erasing.map(a => a.id), []);

  const worksheet = answers.filter(a => /i hear that you feel|i hear you saying|sounds like you're feeling/i.test(a.text));
  check('none is written in worksheet voice', worksheet.map(a => a.id), []);

  const missing = answers.filter(a => !a.text || a.text.split(/\s+/).length < 8);
  check('every scenario still has a real answer', missing.map(a => a.id), []);

  // Phil's read on the app was "simpy". The measurement behind the rewrite: an
  // answer that apologizes or agrees and then leaves the user holding nothing -
  // no commitment, no limit, no want, not even a question. Ten of the scripted
  // answers did that before this pass.
  const folds = answers.filter(a => {
    const t = String(a.text);
    const gives = /\b(you're right|that's fair|fair point|fair enough|my fault|my bad|that's on me|i'm sorry|sorry|i should have|i should've|no excuse)\b/i.test(t);
    const holds = /\b(i'll|i will|i'm going to|i'm not|from now on|next time|next one|that won't happen|let me|let's|tell me|i want|i do want|i'd still|my intent|what do you need|what's the fastest|how do you want|how are you|i can have|i can't|going forward)\b|\?\s*$/i.test(t);
    return gives && !holds;
  });
  check('no scripted answer folds with nothing behind it', folds.map(a => a.id), []);
}

section('grounded response: worksheet phrasing is rewritten on the way out');
{
  const { app } = loadApp();
  app.setState({ practicePerson: 'wife' });
  const polish = t => app.fns.polishGroundedResponse(t);
  check('a feelings lead-in becomes plain speech',
    polish("I hear that you're feeling unheard and frustrated right now. I am not going anywhere."),
    "You're unheard and frustrated right now. I am not going anywhere.");
  check('mid-sentence too',
    polish("I was trying to connect, but I hear you saying I was pushy. Let me back off."),
    "I was trying to connect, but you're telling me I was pushy. Let me back off.");
  check('sounds-like gets the same treatment',
    polish("It sounds like you're feeling left behind. What is going on underneath it?"),
    "You feel left behind. What is going on underneath it?");
  // "I hear that you're feeling X and that Y" only parses because of the lead-in.
  check('a sentence that needs the lead-in keeps it',
    polish("I hear that you're feeling ignored and that I missed something important. I am here now."),
    "I hear that you're feeling ignored and that I missed something important. I am here now.");
}

// ------------------------------------------------------------------ report --
function report() {
  console.log('');
  if (failures.length) {
    console.log(failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach(f => console.log('  FAIL  ' + f));
    process.exit(1);
  }
  console.log(passed + ' passed');
}

policyTests().then(report, err => { console.log('  FAIL  policy tests threw: ' + err.message); process.exit(1); });
