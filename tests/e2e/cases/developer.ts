import type { Case } from '../harness';

const HS = 'HTTP/1.1 200 OK\nServer: Apache/2.4.1\nX-Powered-By: PHP/5.6\nSet-Cookie: sid=abc123\nSet-Cookie: p=1; Secure; HttpOnly; SameSite=Lax';

export const developerCases: Case[] = [
  { id: 'json-validator', text: '{"a":[1,{"b":2}]}', expect: ['Valid JSON', /Maximum nesting depth\s*3/] },
  { id: 'json-validator', name: 'invalid', text: '{"a":1,,}', error: /.+/ },
  { id: 'xml-validator', text: '<a><b/></a>', expect: ['well-formed'] },
  { id: 'xml-validator', name: 'malformed', text: '<a><b></a>', error: /.+/ },
  { id: 'xml-validator', name: 'DTD rejected', text: '<!DOCTYPE a [<!ENTITY x "y">]><a/>', error: /DTD|entit/i },
  { id: 'html-formatter', text: '<div><p>Hi</p><pre>  a\n  b</pre></div>', expect: [/<div>\n\s+<p>\n\s+Hi/, '  a\n  b'] },
  { id: 'css-formatter', text: 'a{color:red;background:url(a;b.png)}', expect: [/a \{\n\s+color: red;/, 'url(a;b.png)'] },
  { id: 'javascript-formatter', text: 'function f(){if(a){return "}"}}', expect: ['return "}"'] },
  { id: 'css-minifier', text: '/* c */ a { color : red ; }\n/*! keep */', expect: [/a\{color:red\}/, '/*! keep */'], expectNot: ['/* c */'] },
  { id: 'javascript-minifier', text: '// c\nfunction a(b, c) {\n  return b + c; /* x */\n}\nvar s = "a  //  b";', expect: ['"a  //  b"'], expectNot: ['// c', '/* x */'] },
  { id: 'html-minifier', text: '<p><b>a</b> <i>b</i></p>\n<!-- x -->\n<pre>  k  </pre>', expect: ['<b>a</b> <i>b</i>', '<pre>  k  </pre>'], expectNot: ['<!-- x -->'] },
  { id: 'url-parser', text: 'https://user:pw@example.com:8443/a?x=1&x=3#f', expect: [/Hostname\s*example\.com/, /Port\s*8443/, 'x', 'credentials'] },
  { id: 'url-parser', name: 'invalid', text: 'not a url', error: /.+/ },
  { id: 'regex-tester', opts: { 'Pattern (JavaScript syntax, without slashes)': '#(\\d+)' }, expect: ['2 matches', '$1=123', '$1=456'] },
  { id: 'regex-tester', name: 'invalid pattern', opts: { 'Pattern (JavaScript syntax, without slashes)': '(' }, error: /Invalid pattern/ },
  { id: 'regex-tester', name: 'catastrophic backtracking is stopped', text: 'a'.repeat(40) + '!', opts: { 'Pattern (JavaScript syntax, without slashes)': '^(a+)+$' }, error: /stopped|backtracking|longer than/i },
  { id: 'regex-tester', name: 'replacement', text: 'a1 b2', opts: { 'Pattern (JavaScript syntax, without slashes)': '([a-z])(\\d)', 'Replacement (optional, supports $1 and $<name>)': '$2$1' }, expect: ['1a 2b'] },
  { id: 'uuid-generator', opts: { 'How many': 3, Version: 'v7 (time-ordered)' }, expect: [/3 UUIDs/i, /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/] },
  { id: 'uuid-generator', name: 'v4 upper', opts: { 'How many': 1, Format: 'UPPERCASE' }, expect: [/[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}/] },
  { id: 'jwt-decoder', expect: ['"sub": "1234567890"', '"alg": "HS256"', 'NOT verified', 'Expired'] },
  { id: 'jwt-decoder', name: 'garbage', text: 'abc', error: /3 dot-separated/ },
  { id: 'jwt-decoder', name: 'alg none flagged', text: 'eyJhbGciOiJub25lIn0.eyJhIjoxfQ.', expect: ['unsigned'] },
  { id: 'http-header-inspector', text: HS, expect: ['Apache/2.4.1', /Set-Cookie/, /Secure|HttpOnly|SameSite|version|leak|disclos/i] },
  { id: 'color-converter', text: '#59D8FF', expect: ['rgb(89, 216, 255)', 'Contrast against black'] },
  { id: 'color-converter', name: 'hsl input', text: 'hsl(270, 50%, 40%)', expect: ['#663399'] },
  { id: 'color-converter', name: 'invalid', text: 'nope', error: /.+/ },
  { id: 'source-code-line-counter', files: [{ name: 'a.js', buffer: '// c\nconst a = 1;\n\n/* b\n c */\nlet b;\n' }, { name: 'x.py', buffer: '# c\nprint(1)\n' }], expect: [/js/, /py/, /Total lines\s*8/] },
];
