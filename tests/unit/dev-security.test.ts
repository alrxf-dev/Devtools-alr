import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import * as V from '../../src/lib/devtools';
import * as X from '../../src/lib/security';
import * as Z from '../../src/lib/zip';

// ---------- CSS ----------
test('CSS format and minify keep strings, urls and semantics', () => {
  const src = 'a,b{color:red;background:url(data:image/png;base64,AA==)}/* c */@media (min-width:1px){p{margin:0 auto;content:"a;b{"}}';
  const f = V.formatCss(src);
  assert.match(f, /a,\nb \{/);
  assert.match(f, /url\(data:image\/png;base64,AA==\)/);
  assert.match(f, /content: "a;b\{"/);
  assert.match(f, /@media \(min-width:1px\) \{/);
  const m = V.minifyCss(f);
  assert.equal(m, 'a,b{color:red;background:url(data:image/png;base64,AA==)}@media (min-width:1px){p{margin:0 auto;content:"a;b{"}}');
  assert.equal(V.minifyCss('/*! keep */ a { x : 1 ; }'), '/*! keep */a{x:1}');
  assert.throws(() => V.formatCss('a{color:red'), /Unbalanced/);
  assert.throws(() => V.minifyCss('a{content:"x}'), /Unterminated string/);
  assert.throws(() => V.minifyCss('/* open'), /Unterminated comment/);
});

// ---------- JS ----------
test('conservative JS minifier preserves strings, regex and ASI-sensitive newlines', () => {
  const src = `
    // comment
    const a = "  keep   spaces // not a comment ";
    const re = /ab+c\\/ [/]/gi;   /* block */
    let b = a
    ++b
    const t = \`x   \${a}  y\`;
    return  a  +  b
  `;
  const m = V.minifyJsConservative(src);
  assert.ok(m.includes('"  keep   spaces // not a comment "'));
  assert.ok(m.includes('/ab+c\\/ [/]/gi'));
  assert.ok(m.includes('let b=a\n++b'), m);
  assert.ok(m.includes('`x   ${a}  y`'));
  assert.ok(!m.includes('// comment'));
  assert.ok(!m.includes('/* block */'));
  assert.ok(m.includes('return a+b'));
  assert.throws(() => V.minifyJsConservative('const s = "oops\n'), /Unterminated string/);
  assert.throws(() => V.minifyJsConservative('/* never ends'), /Unterminated block comment/);
});

test('minifier never evaluates code', () => {
  (globalThis as Record<string, unknown>).__pwned = false;
  V.minifyJsConservative('globalThis.__pwned = true;');
  V.formatJsBasic('globalThis.__pwned = true;');
  assert.equal((globalThis as Record<string, unknown>).__pwned, false);
});

test('basic JS formatter indents blocks and rejects unbalanced braces', () => {
  const f = V.formatJsBasic('function f(a){if(a){return "}";}else{x();}}');
  assert.match(f, /function f\(a\) \{\n  if \(a\) \{\n    return "\}";\n  \} else \{\n    x\(\);\n  \}\n\}/);
  assert.throws(() => V.formatJsBasic('function f(){'), /Unbalanced/);
});

// ---------- HTML ----------
test('HTML format/minify preserve raw elements and drop comments', () => {
  const src = '<!DOCTYPE html><html><body><!-- hi --><div class="a"><p>Hello   world</p><br><pre>  keep\n  me </pre><script>if (a < b) { x() }</script></div></body></html>';
  const f = V.formatHtml(src);
  assert.match(f, /<div class="a">\n {6}<p>/);
  assert.match(f, /<pre>  keep\n  me <\/pre>/);
  assert.match(f, /<script>if \(a < b\) \{ x\(\) \}<\/script>/);
  const m = V.minifyHtml(src);
  assert.ok(!m.includes('<!-- hi -->'));
  assert.ok(m.includes('<pre>  keep\n  me </pre>'));
  assert.ok(m.includes('Hello world'));
  assert.throws(() => V.formatHtml('</div>'), /no matching opening/);
});

// ---------- URL / JWT / colour / headers ----------
test('parseUrl', () => {
  const p = V.parseUrl('https://user:pw@example.com:8443/a/b?x=1&y=%20z#frag');
  assert.equal(p.hostname, 'example.com');
  assert.deepEqual(p.params, [['x', '1'], ['y', ' z']]);
  assert.ok(p.warnings.some((w) => /credentials/.test(w)));
  assert.equal(p.password, '(present — hidden)');
  assert.throws(() => V.parseUrl('example.com'), /absolute URL/);
  assert.throws(() => V.parseUrl(''), /Enter a URL/);
});

const b64u = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

test('JWT decoding warns that it does not verify', () => {
  const tok = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: '1', exp: 1 })}.${b64u('sig')}`;
  const r = V.decodeJwt(tok, 1_700_000_000_000);
  assert.equal(r.payload['sub'], '1');
  assert.ok(r.warnings[0]?.includes('NOT verified'));
  assert.ok(r.warnings.some((w) => /Expired/.test(w)));
  assert.equal(V.decodeJwt('Bearer ' + tok).header['alg'], 'HS256');
  const none = V.decodeJwt(`${b64u({ alg: 'none' })}.${b64u({})}.`);
  assert.ok(none.warnings.some((w) => /unsigned/.test(w)));
  assert.equal(none.signaturePresent, false);
  assert.throws(() => V.decodeJwt('a.b'), /3 dot-separated/);
  assert.throws(() => V.decodeJwt('a.b.c.d.e'), /JWE/);
  assert.throws(() => V.decodeJwt('!!!.e30.x'), /header segment/);
  assert.throws(() => V.decodeJwt(`${b64u('[1]')}.e30.x`), /not a JSON object/);
});

test('colour conversion', () => {
  assert.equal(V.parseColor('#f00').hex, '#FF0000');
  assert.equal(V.parseColor('rgb(0, 128, 255)').hex, '#0080FF');
  assert.equal(V.parseColor('hsl(120, 100%, 50%)').hex, '#00FF00');
  assert.equal(V.parseColor('#FF000080').rgb, 'rgba(255, 0, 0, 0.502)');
  assert.equal(V.parseColor('#ffffff').hsl, 'hsl(0, 0%, 100%)');
  assert.throws(() => V.parseColor('rgb(300,0,0)'), /0–255/);
  assert.throws(() => V.parseColor('banana'), /Unrecognised/);
  assert.ok(Math.abs(V.contrastRatio(V.parseColor('#000'), V.parseColor('#fff')) - 21) < 0.01);
});

test('HTTP header parsing', () => {
  const r = V.parseHttpHeaders('HTTP/1.1 200 OK\nServer: nginx/1.2\nSet-Cookie: sid=1; Path=/\nX-Powered-By: PHP\nCache-Control: a\n  b\nSet-Cookie: t=2; Secure; HttpOnly; SameSite=Lax');
  assert.equal(r.headers.length, 5);
  assert.deepEqual(r.duplicates, ['set-cookie']);
  assert.ok(r.notes.some((n) => /lacks: Secure, HttpOnly, SameSite/.test(n)));
  assert.ok(r.notes.some((n) => /X-Powered-By/.test(n)));
  assert.equal(r.headers[3]?.value, 'a b');
  assert.throws(() => V.parseHttpHeaders('not a header'), /Line 1/);
  assert.throws(() => V.parseHttpHeaders('Bad Name: x'), /not a valid header name/);
  assert.throws(() => V.parseHttpHeaders(''), /No headers/);
});

test('source line counter', () => {
  const js = '// a\nconst x = 1; // trailing\n\n/* b\n c */\nconst y = 2;\n/* one */ f();';
  const c = V.countSourceLines(js, 'js');
  assert.deepEqual(c, { total: 7, code: 3, comment: 3, blank: 1 });
  assert.deepEqual(V.countSourceLines('', 'js'), { total: 0, code: 0, comment: 0, blank: 0 });
  assert.equal(V.countSourceLines('# c\nx=1', 'py').comment, 1);
  assert.equal(V.languageForExt('.TSX'), 'ts');
  assert.equal(V.languageForExt('zzz'), 'generic');
});

// ---------- security ----------
test('secure token generation: right length/alphabet and unbiased', () => {
  assert.equal(X.generateToken(16, 'hex').token.length, 32);
  assert.match(X.generateToken(32, 'base64url').token, /^[A-Za-z0-9_-]+$/);
  assert.match(X.generateToken(20, 'base62').token, /^[A-Za-z0-9]{20}$/);
  assert.equal(X.generateToken(10, 'digits').token.length, 10);
  assert.notEqual(X.generateToken(16).token, X.generateToken(16).token);
  assert.throws(() => X.generateToken(0), /between 1 and 1024/);
  assert.throws(() => X.generateToken(5000), /between 1 and 1024/);
  const counts = new Array(10).fill(0) as number[];
  for (let i = 0; i < 20000; i++) counts[X.randomInt(10)]!++;
  for (const c of counts) assert.ok(c > 1700 && c < 2300, `bucket ${c} out of range`);
  assert.throws(() => X.randomInt(0), /max/);
});

test('password generator honours options and includes every selected set', () => {
  for (let i = 0; i < 50; i++) {
    const { password } = X.generatePassword({ length: 12, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: true });
    assert.equal(password.length, 12);
    assert.match(password, /[a-z]/);
    assert.match(password, /[A-Z]/);
    assert.match(password, /\d/);
    assert.match(password, /[^A-Za-z0-9]/);
    assert.doesNotMatch(password, /[Il1O0o|`'"]/);
  }
  assert.throws(() => X.generatePassword({ length: 12, lower: false, upper: false, digits: false, symbols: false, excludeAmbiguous: false }), /at least one/);
  assert.throws(() => X.generatePassword({ length: 2, lower: true, upper: false, digits: false, symbols: false, excludeAmbiguous: false }), /between 4/);
});

test('UUID generation and inspection', () => {
  const v4 = X.generateUuidV4();
  assert.match(v4, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const v7 = X.generateUuidV7(1_700_000_000_000);
  assert.equal(X.inspectUuid(v7).version, 7);
  assert.equal(X.inspectUuid(v7).timestamp, '2023-11-14T22:13:20.000Z');
  assert.equal(X.inspectUuid(v4).version, 4);
  assert.equal(X.inspectUuid('00000000-0000-0000-0000-000000000000').nil, true);
  assert.equal(X.inspectUuid('nope').valid, false);
  assert.equal(X.inspectUuid('{6BA7B810-9DAD-11D1-80B4-00C04FD430C8}').version, 1);
  assert.equal(X.inspectUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8').timestamp, '1998-02-04T22:13:53.151Z');
  assert.ok(X.inspectUuid(v4).notes.some((n) => /not a secret/.test(n)));
});

test('password estimator penalises common, patterned and short passwords', () => {
  assert.equal(X.estimatePassword('').score, 0);
  assert.equal(X.estimatePassword('password').score, 0);
  assert.equal(X.estimatePassword('P@ssw0rd').score, 0);
  assert.ok(X.estimatePassword('abcd1234').score <= 1);
  assert.ok(X.estimatePassword('Summer2024!').score <= 2);
  assert.ok(X.estimatePassword('aaaaaaaaaaaaaaaa').score <= 1);
  const strong = X.estimatePassword('vK9#mPq2$Lw8!xZr4tNb');
  assert.equal(strong.score, 4);
  assert.match(strong.crackTimeOffline, /years/);
  assert.ok(X.estimatePassword('correct horse battery staple').entropyBits > X.estimatePassword('Tr0ub4dor').entropyBits);
});

test('URL syntax inspector flags classic disguises but never claims safety', () => {
  const find = (u: string, re: RegExp) => X.inspectUrlSyntax(u).findings.some((f) => re.test(f.message));
  assert.ok(find('http://paypal.com@evil.example/login', /user:password@/));
  assert.ok(find('http://192.168.0.1/', /IP address/));
  assert.ok(find('http://xn--pple-43d.com/', /Punycode/));
  assert.ok(find('javascript:alert(1)', /can run code/));
  assert.ok(find('http://example.com', /HTTP/));
  assert.ok(find('https://a.b.c.d.e.example.com/', /subdomain/));
  assert.ok(find('https://example.com/%2e%2e%2f', /Percent-encoded/));
  assert.equal(X.inspectUrlSyntax('not a url').parsed, false);
  const clean = X.inspectUrlSyntax('https://example.com/');
  assert.match(clean.findings[0]?.message ?? '', /does not mean the site is safe/);
});

test('CSP builder validates tokens and warns on risky policies', () => {
  const ok = X.buildCsp(X.defaultCsp);
  assert.match(ok.header, /^default-src 'self'; script-src 'self'/);
  assert.match(ok.header, /upgrade-insecure-requests$/);
  assert.ok(ok.warnings.some((w) => /meta/.test(w)));
  const risky = X.buildCsp({ ...X.defaultCsp, scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.example.com'] });
  assert.ok(risky.warnings.some((w) => /unsafe-inline/.test(w)));
  assert.throws(() => X.buildCsp({ ...X.defaultCsp, scriptSrc: ['self'] }), /must be written in single quotes/);
  assert.throws(() => X.buildCsp({ ...X.defaultCsp, scriptSrc: ['unsafe-inline'] }), /single quotes/);
  assert.throws(() => X.buildCsp({ ...X.defaultCsp, scriptSrc: ['nonce-abc123'] }), /single quotes/);
  assert.throws(() => X.buildCsp({ ...X.defaultCsp, objectSrc: ["'none'", "'self'"] }), /cannot be combined/);
  assert.throws(() => X.buildCsp({ ...X.defaultCsp, scriptSrc: ["'self'; script-src *"] }), /not a valid/);
});

test('SRI hashes match openssl-style output and tags are escaped', async () => {
  const sri = await X.sriFromBytes(new TextEncoder().encode('alert("hi");'), ['SHA-384']);
  const { createHash } = await import('node:crypto');
  assert.equal(sri, 'sha384-' + createHash('sha384').update('alert("hi");').digest('base64'));
  const tag = X.sriTag('script', 'https://cdn.example.com/a.js?x="<b>', sri);
  assert.ok(!tag.includes('"<b>'));
  assert.match(tag, /crossorigin="anonymous"/);
  assert.throws(() => X.sriTag('script', 'http://x/a.js', sri), /https/);
});

// ---------- archive: real inflate-time bomb defence ----------
test('inflateLimited stops at the output limit regardless of what the archive declared', async () => {
  const zeros = new Uint8Array(8_000_000);
  const comp = new Uint8Array(deflateRawSync(zeros));
  assert.ok(comp.length < 20_000);
  await assert.rejects(() => Z.inflateLimited(comp, 1_000_000), /exceeded the 1 MiB limit/);
  const ok = await Z.inflateLimited(comp, 10_000_000);
  assert.equal(ok.length, 8_000_000);
  await assert.rejects(() => Z.inflateLimited(Uint8Array.from([1, 2, 3, 4, 5]), 1000), /corrupt/);
});

test('minifyHtml keeps meaningful whitespace between inline elements and inside pre', async () => {
  const { minifyHtml } = await import('../../src/lib/devtools');
  assert.equal(minifyHtml('<p><b>a</b> <i>b</i></p>\n<pre>  x  </pre>'), '<p><b>a</b> <i>b</i></p><pre>  x  </pre>');
  assert.equal(minifyHtml('<div>\n  <!-- c -->\n  <span>a</span>   <span>b</span>\n</div>'), '<div><span>a</span> <span>b</span></div>');
});

test('countSourceLines does not count the final newline as an extra blank line', async () => {
  const { countSourceLines } = await import('../../src/lib/devtools');
  assert.deepEqual(countSourceLines('a\nb\n', 'js'), { total: 2, code: 2, comment: 0, blank: 0 });
  assert.deepEqual(countSourceLines('a\n\n', 'js'), { total: 2, code: 1, comment: 0, blank: 1 });
});
