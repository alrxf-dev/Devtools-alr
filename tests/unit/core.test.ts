import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as T from '../../src/lib/text';
import * as E from '../../src/lib/encoding';
import * as D from '../../src/lib/data';
import * as H from '../../src/lib/hash';

// ---------- text ----------
test('textStats counts words, lines and graphemes', () => {
  const s = T.textStats('Hello  world\n\nthird line');
  assert.equal(s.words, 4);
  assert.equal(s.lines, 3);
  assert.equal(s.nonEmptyLines, 2);
  assert.equal(T.textStats('').words, 0);
  assert.equal(T.textStats('👨‍👩‍👧').characters, 1);
  assert.equal(T.textStats('é').bytesUtf8, 2);
});

test('convertCase handles all modes', () => {
  assert.equal(T.convertCase('hello World-foo', 'camel'), 'helloWorldFoo');
  assert.equal(T.convertCase('hello World', 'snake'), 'hello_world');
  assert.equal(T.convertCase('helloWorldFoo', 'kebab'), 'hello-world-foo');
  assert.equal(T.convertCase('one two', 'constant'), 'ONE_TWO');
  assert.equal(T.convertCase('the quick. brown', 'sentence'), 'The quick. Brown');
  assert.equal(T.convertCase('ÀB', 'lower'), 'àb');
});

test('cleanWhitespace and line tools', () => {
  assert.equal(T.cleanWhitespace('  a   b  \r\n\r\n\r\n c\u200B '), 'a b\n\nc');
  assert.deepEqual(T.removeDuplicateLines('a\nA\nb\na'), { text: 'a\nb', removed: 2 });
  assert.equal(T.removeDuplicateLines('a\nA', { caseSensitive: true }).text, 'a\nA');
  assert.equal(T.removeEmptyLines('a\n\n  \nb'), 'a\nb');
  assert.equal(T.sortLines('b\na\nc', 'asc'), 'a\nb\nc');
  assert.equal(T.sortLines('file10\nfile2', 'natural'), 'file2\nfile10');
  assert.equal(T.reverseText('abc'), 'cba');
  assert.equal(T.reverseText('a b c', 'words'), 'c b a');
});

test('findReplace is literal by default and rejects empty/ReDoS patterns', () => {
  assert.deepEqual(T.findReplace('a.b a.b', '.', '-'), { text: 'a-b a-b', count: 2 });
  assert.equal(T.findReplace('Cat cat', 'cat', 'x', { caseSensitive: true }).count, 1);
  assert.equal(T.findReplace('foo bar', '(\\w+) (\\w+)', '$2 $1', { regex: true }).text, 'bar foo');
  assert.throws(() => T.findReplace('x', '', 'y'), /empty/);
  assert.throws(() => T.findReplace('aaaa', '(a+)+$', 'x', { regex: true }), /backtracking/);
  assert.throws(() => T.findReplace('x', '(', 'y', { regex: true }));
});

test('diffLines produces correct add/remove/equal ops', () => {
  const ops = T.diffLines('a\nb\nc', 'a\nx\nc\nd');
  assert.deepEqual(T.diffSummary(ops), { added: 2, removed: 1, unchanged: 2 });
  assert.equal(T.toUnifiedDiff(ops).split('\n')[1], '- b');
  assert.deepEqual(T.diffLines('', '').length, 0);
  assert.throws(() => T.diffLines('x\n'.repeat(5000), 'y', 4000), /limited/);
});

// ---------- encoding ----------
test('base64 round-trips unicode and rejects garbage', () => {
  const s = 'héllo ✓ 日本語 😀';
  assert.equal(E.decodeBase64(E.encodeBase64(s)), s);
  assert.equal(E.encodeBase64('hello'), 'aGVsbG8=');
  assert.equal(E.encodeBase64('??>>', true), 'Pz8-Pg');
  assert.equal(E.decodeBase64('Pz8-Pg'), '??>>');
  assert.equal(E.decodeBase64('data:text/plain;base64,aGVsbG8='), 'hello');
  assert.throws(() => E.decodeBase64('not*base64!'), /not valid Base64/);
  assert.throws(() => E.decodeBase64('/w=='), /UTF-8/);
  assert.equal(E.base64ToBytes('').length, 0);
});

test('url encode/decode', () => {
  assert.equal(E.urlEncode('a b&c=d/é'), 'a%20b%26c%3Dd%2F%C3%A9');
  assert.equal(E.urlDecode('a%20b%26'), 'a b&');
  assert.equal(E.urlDecode('a+b', true), 'a b');
  assert.throws(() => E.urlDecode('%E0%A4%A'), /invalid percent/);
  assert.throws(() => E.urlEncode('\uD800'), /surrogate/);
});

test('html entities', () => {
  assert.equal(E.htmlEncode('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(E.htmlDecode('&lt;b&gt; &amp;amp; &#65; &#x1F600; &unknown;'), '<b> &amp; A \u{1F600} &unknown;');
  assert.equal(E.htmlDecode('&#xD800;'), '&#xD800;');
  assert.equal(E.htmlEncode('é', { nonAscii: true }), '&#233;');
});

test('hex/binary conversions', () => {
  assert.equal(E.textToHex('Hi'), '48 69');
  assert.equal(E.hexToText('48 69'), 'Hi');
  assert.equal(E.hexToText('0x48,0x69'), 'Hi');
  assert.throws(() => E.hexToText('4'), /odd/);
  assert.throws(() => E.hexToText('zz'), /may only contain/);
  assert.equal(E.textToBinary('A'), '01000001');
  assert.equal(E.binaryToText('01000001 01000010'), 'AB');
  assert.throws(() => E.binaryToText('0100'), /multiple of 8/);
  assert.throws(() => E.binaryToText('0102'), /only contain/);
});

test('validateUtf8 locates invalid byte', () => {
  assert.equal(E.validateUtf8(new TextEncoder().encode('ok é')).valid, true);
  const bad = E.validateUtf8(Uint8Array.from([0x61, 0x62, 0xff, 0x63]));
  assert.equal(bad.valid, false);
  assert.equal(bad.firstErrorOffset, 2);
  assert.equal(E.validateUtf8(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])).hasBom, true);
  assert.equal(E.validateUtf8(Uint8Array.from([0xc0, 0x80])).valid, false); // overlong
});

test('unicode inspector', () => {
  const [a, b] = E.inspectUnicode('A😀');
  assert.equal(a?.codePoint, 'U+0041');
  assert.equal(b?.codePoint, 'U+1F600');
  assert.equal(b?.utf8, 'F0 9F 98 80');
  assert.equal(b?.utf16, 'D83D DE00');
});

test('base conversion supports big values and rejects bad digits', () => {
  assert.deepEqual(E.convertBase('255', 10), { binary: '11111111', octal: '377', decimal: '255', hex: 'FF' });
  assert.equal(E.convertBase('0xff', 16).decimal, '255');
  assert.equal(E.convertBase('ffffffffffffffffffff', 16).decimal, '1208925819614629174706175');
  assert.equal(E.convertBase('-10', 2).decimal, '-2');
  assert.throws(() => E.convertBase('12', 2), /not a valid base-2/);
  assert.throws(() => E.convertBase('', 10), /No digits/);
});

test('timestamps', () => {
  const a = E.parseUnixTimestamp('1700000000', 1700000100000);
  assert.equal(a.iso, '2023-11-14T22:13:20.000Z');
  assert.equal(a.unit, 'seconds');
  assert.equal(a.relative, '1 minute ago');
  assert.equal(E.parseUnixTimestamp('1700000000000').unit, 'milliseconds');
  assert.throws(() => E.parseUnixTimestamp('abc'), /must be a number/);
  assert.equal(E.dateToUnix('2023-11-14T22:13:20Z').seconds, 1700000000);
  assert.throws(() => E.dateToUnix('nope'), /could not be parsed/);
  assert.equal(E.formatDate('2023-11-14T22:13:20Z')['DD/MM/YYYY'], '14/11/2023');
});

// ---------- data ----------
test('parseCsv handles quotes, delimiters, CRLF and embedded newlines', () => {
  assert.deepEqual(D.parseCsv('a,b\r\n"x,1","he said ""hi"""\n"multi\nline",z'), [['a', 'b'], ['x,1', 'he said "hi"'], ['multi\nline', 'z']]);
  assert.deepEqual(D.parseCsv('a;b\n1;2', { delimiter: ';' }), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(D.parseCsv('a,,c\n'), [['a', '', 'c']]);
  assert.deepEqual(D.parseCsv('\uFEFFa,b'), [['a', 'b']]);
  assert.deepEqual(D.parseCsv(''), []);
  assert.throws(() => D.parseCsv('a,"unterminated'), /Unterminated/);
  assert.throws(() => D.parseCsv('a,b', { delimiter: ';;' }), /one character/);
});

test('csv <-> json round trips and validates', () => {
  const json = D.csvToJson('name,age\nAda,36\nLinus,54', { inferTypes: true });
  assert.deepEqual(JSON.parse(json), [{ name: 'Ada', age: 36 }, { name: 'Linus', age: 54 }]);
  assert.throws(() => D.csvToJson('a,a\n1,2'), /Duplicate column/);
  assert.throws(() => D.csvToJson('a\n1,2'), /Row 2 has 2 fields/);
  const csv = D.jsonToCsv('[{"a":1,"b":{"c":"x,y"}},{"a":2,"d":true}]');
  assert.equal(csv, 'a,b.c,d\n1,"x,y",\n2,,true');
  assert.throws(() => D.jsonToCsv('{bad'), /Invalid JSON/);
  assert.equal(D.convertCsvDelimiter('a,b\n1,"x;y"', ',', ';'), 'a;b\n1;"x;y"');
});

test('stringifyCsv neutralises formula injection', () => {
  assert.equal(D.stringifyCsv([['=1+1', '+cmd', '-5', 'ok']]), "'=1+1,'+cmd,-5,ok");
});

test('JSON validation reports line and column', () => {
  assert.equal(D.validateJson('{"a":[1,2,{"b":null}]}').valid, true);
  assert.equal(D.validateJson('{"a":[1,2,{"b":null}]}').depth, 3);
  const bad = D.validateJson('{\n  "a": 1,\n  "b": }');
  assert.equal(bad.valid, false);
  assert.match(bad.message, /Invalid JSON/);
  assert.equal(D.validateJson('').valid, false);
  assert.equal(D.formatJson('{"b":1,"a":2}', 2, true), '{\n  "a": 2,\n  "b": 1\n}');
  assert.equal(D.minifyJson('{ "a" : [ 1 , 2 ] }'), '{"a":[1,2]}');
});

test('NDJSON formatter reports the failing line', () => {
  assert.equal(D.formatNdjson('{"a": 1}\n\n{"b": 2}'), '{"a":1}\n{"b":2}');
  assert.throws(() => D.formatNdjson('{"a":1}\n{oops}'), /Line 2/);
});

test('XML parsing, validation and conversion', () => {
  assert.doesNotThrow(() => D.parseXmlStrict('<?xml version="1.0"?><a x="1"><b/><c>t</c></a>'));
  assert.throws(() => D.parseXmlStrict('<a><b></a>'), /Mismatched/);
  assert.throws(() => D.parseXmlStrict('<a>'), /Unclosed/);
  assert.throws(() => D.parseXmlStrict('<a/><b/>'), /Multiple root/);
  assert.throws(() => D.parseXmlStrict(''), /empty/);
  assert.throws(() => D.parseXmlStrict('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'), /entity/i);
  assert.throws(() => D.parseXmlStrict('<a b=1></a>'), /Malformed/);
  const j = JSON.parse(D.xmlToJson('<root><item id="1">x</item></root>'));
  assert.equal(j.root.item._text, 'x');
  assert.equal(j.root.item._attributes.id, '1');
  const x = D.jsonToXml('{"name":"Ada & <Co>","n":[1,2]}', 'person');
  assert.match(x, /<person>/);
  assert.match(x, /Ada &amp; &lt;Co&gt;/);
  assert.equal(D.formatXml('<a><b>t</b><c><d/></c></a>'), '<a>\n  <b>t</b>\n  <c>\n    <d/>\n  </c>\n</a>');
  assert.match(D.csvToXml('a b,c\n1,<2>'), /<field_a_b>1<\/field_a_b>[\s\S]*&lt;2&gt;/);
});

test('YAML conversions are safe and report errors', () => {
  assert.deepEqual(JSON.parse(D.yamlToJson('a: 1\nb:\n  - x\n  - y')), { a: 1, b: ['x', 'y'] });
  assert.throws(() => D.yamlToJson('a: [1, 2'), /Invalid YAML/);
  // Custom JS tags must not execute or construct functions.
  assert.throws(() => D.yamlToJson('a: !!js/function "function(){return 1}"'), /unsupported or custom tag/);
  assert.throws(() => D.yamlToJson('a: 1\na: 2'), /Invalid YAML/); // duplicate keys
  const bomb = ['a: &a [x,x,x,x,x,x,x,x,x]', ...'bcdefghi'.split('').map((k, i) => { const p = 'abcdefgh'[i]; return `${k}: &${k} [${Array(9).fill('*' + p).join(',')}]`; }), 'z: [*i]'].join('\n');
  assert.throws(() => D.yamlToJson(bomb), /Invalid YAML.*alias|Excessive alias/); // billion-laughs style expansion
  assert.deepEqual(JSON.parse(D.yamlToJson('a: &x [1]\nb: *x')), { a: [1], b: [1] });
  assert.equal(D.jsonToYaml('{"a":[1,2]}'), 'a:\n  - 1\n  - 2\n');
});

// ---------- hash ----------
test('hashes match Node crypto for many sizes (incl. MD5 block boundaries)', async () => {
  for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_000]) {
    const data = Uint8Array.from({ length: len }, (_, i) => (i * 31 + 7) & 0xff);
    for (const [a, n] of [['MD5', 'md5'], ['SHA-1', 'sha1'], ['SHA-256', 'sha256'], ['SHA-384', 'sha384'], ['SHA-512', 'sha512']] as const) {
      assert.equal(await H.hashBytes(a, data), createHash(n).update(data).digest('hex'), `${a} len=${len}`);
    }
  }
});

test('MD5 streaming over chunks equals one-shot; CRC32 known vector', async () => {
  const data = Uint8Array.from({ length: 10_000 }, (_, i) => i & 0xff);
  const blob = new Blob([data]);
  assert.equal(await H.hashFile('MD5', blob), H.md5(data));
  assert.equal(await H.hashFile('SHA-256', blob), createHash('sha256').update(data).digest('hex'));
  assert.equal(H.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(await H.hashFile('CRC32', new Blob(['123456789'])), 'cbf43926');
  await assert.rejects(() => H.hashFile('MD5', blob, undefined, AbortSignal.abort()), /Cancelled/);
});

test('hash comparison and algorithm guessing', () => {
  assert.equal(H.timingSafeEqualHex('ABCD', 'abcd '), true);
  assert.equal(H.timingSafeEqualHex('abcd', 'abce'), false);
  assert.equal(H.timingSafeEqualHex('abc', 'abcd'), false);
  assert.deepEqual(H.guessAlgoFromHex('a'.repeat(64)), ['SHA-256']);
  assert.deepEqual(H.guessAlgoFromHex('xyz'), []);
  assert.ok(H.LEGACY_NOTICE['MD5']);
});

test('convertCase handles camelCase boundaries, acronyms and odd casing', async () => {
  const { convertCase } = await import('../../src/lib/text');
  assert.equal(convertCase('hello wORLD', 'camel'), 'helloWorld');
  assert.equal(convertCase('fooBarBaz', 'snake'), 'foo_bar_baz');
  assert.equal(convertCase('HTTPServer error', 'kebab'), 'http-server-error');
  assert.equal(convertCase('already_snake_case', 'pascal'), 'AlreadySnakeCase');
  assert.equal(convertCase('', 'camel'), '');
});
