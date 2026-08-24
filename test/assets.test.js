// The page used to pull a 407KB Tailwind compiler and a 102KB icon font from
// two CDNs at runtime. Both are now built into the file, which means a class or
// an icon added later has nothing generating CSS for it - it just renders
// unstyled. These tests are what catches that.
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const failures = [];
let passed = 0;

function check(label, ok, detail) {
  if (ok) { passed++; return; }
  failures.push(label + (detail ? '\n      ' + detail : ''));
}

// ---- no runtime dependency on a third-party origin --------------------------
const remote = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !/^https:\/\/(foundationcall\.netlify\.app|script\.google\.com|fontawesome\.com|policies\.google\.com|ai\.google\.dev)/.test(u));
check('no third-party assets are fetched at runtime', remote.length === 0, remote.join(', '));

// ---- every class used has a rule somewhere ---------------------------------
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
check('the built Tailwind sheet is present', /<style id="tw">/.test(html) && css.length > 15000, css.length + ' chars of CSS');

const used = new Set();
for (const m of html.matchAll(/class="([^"]*)"/g)) {
  // Class attributes inside template strings carry interpolations; the literal
  // classes around them still count, the expression itself does not.
  for (const tok of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
    if (!tok || tok.includes('`') || tok.includes('$')) continue;
    used.add(tok);
  }
}
const escapeClass = t => '.' + t.replace(/([:[\]%/.,#()!])/g, '\\$1');
// Markers that intentionally carry no styling of their own.
// `group` is a marker for variants; a gi-* class only exists to override the
// width of a non-square icon, and the square ones need no rule at all.
const NO_RULE_EXPECTED = t => t === 'group' || /^gi-[a-z0-9-]+$/.test(t);
const unstyled = [...used].filter(t => !NO_RULE_EXPECTED(t) && !css.includes(escapeClass(t)));
check('every class in the markup has a CSS rule', unstyled.length === 0,
  unstyled.length ? 'no rule for: ' + unstyled.join(', ') +
  '\n      rebuild with: npx tailwindcss@3.4.17 -i in.css -o out.css --content index.html --minify' : '');

// ---- every icon reference resolves to a symbol ------------------------------
const symbols = new Set([...html.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map(m => m[1]));
const refs = new Set([
  ...[...html.matchAll(/href="#i-([a-z0-9-]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/setIcon\([^,]+,\s*"([a-z0-9-]+)"\)/g)].map(m => m[1])
]);
const dangling = [...refs].filter(r => !symbols.has(r));
check('every icon reference resolves to a sprite symbol', dangling.length === 0, dangling.join(', '));
const orphans = [...symbols].filter(s => !refs.has(s));
check('the sprite carries no unused symbols', orphans.length === 0, orphans.join(', '));
check('no Font Awesome class markup is left', !/class="fa[srlbd]? fa-/.test(html));

// ---- report -----------------------------------------------------------------
console.log('');
if (failures.length) {
  console.log(failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.forEach(f => console.log('  FAIL  ' + f));
  process.exit(1);
}
console.log(passed + ' passed  (' + used.size + ' classes, ' + symbols.size + ' icons)');
