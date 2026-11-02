#!/usr/bin/env node
/**
 * Project lint. This is a small purpose-built checker on the TypeScript compiler API, NOT ESLint:
 * ESLint's TypeScript parser was not installable when this project was built. It enforces the rules that matter
 * for this app's safety and consistency. Exit code 1 on any finding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = ['src'];
const ALLOW_HTML_SINK = new Set(['src/components/SafeHtml.tsx']);
const PURPLE = /#(?:8b7cff|7c3aed|8b5cf6|a855f7|6d28d9|9333ea|6b21a8|a78bfa|7e22ce)\b/iu;
const BANNED_WORDS = /\b(premium|ai[- ]powered|revolutionary|cutting[- ]edge)\b/iu;

const findings = [];
const add = (file, line, rule, msg) => findings.push(`${path.relative(root, file)}:${line} [${rule}] ${msg}`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, out); } else out.push(p);
  }
  return out;
}

const files = SRC_DIRS.flatMap((d) => walk(path.join(root, d)));
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  if (/\.(css|ts|tsx)$/u.test(file)) {
    text.split('\n').forEach((l, i) => {
      if (PURPLE.test(l)) add(file, i + 1, 'no-purple', 'purple colour found; the palette is navy, turquoise, orange, cream');
      if (/violet|purple/iu.test(l) && !/no-purple/u.test(l)) add(file, i + 1, 'no-purple', 'purple/violet name found');
      if (BANNED_WORDS.test(l) && !rel.startsWith('src/registry/catalog/')) add(file, i + 1, 'no-hype-copy', 'marketing filler word');
    });
  }
  if (!/\.(ts|tsx)$/u.test(file) || file.endsWith('.d.ts')) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  if (/@ts-(ignore|nocheck|expect-error)/u.test(text)) add(file, 1, 'no-ts-suppress', 'TypeScript error suppression comment');
  text.split('\n').forEach((l, i) => { if (/(\/\/|\/\*|^\s*\*).*\b(TODO|FIXME|XXX)\b/u.test(l)) add(file, i + 1, 'no-todo', 'unfinished-work marker in a comment'); });
  const visit = (n) => {
    if (n.kind === ts.SyntaxKind.AnyKeyword) add(file, line(n), 'no-explicit-any', 'explicit any');
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && (callee.text === 'eval' || callee.text === 'Function')) add(file, line(n), 'no-eval', `${callee.text}() is forbidden`);
      if (ts.isIdentifier(callee) && (callee.text === 'setTimeout' || callee.text === 'setInterval') && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) add(file, line(n), 'no-eval', 'timer with a string callback');
      if (ts.isPropertyAccessExpression(callee)) {
        const name = callee.name.text;
        if ((name === 'insertAdjacentHTML' || name === 'write' && callee.expression.getText(sf) === 'document') && !ALLOW_HTML_SINK.has(rel)) add(file, line(n), 'no-html-sink', `${name}() outside the sanitising component`);
        if (callee.expression.getText(sf) === 'console' && name === 'log') add(file, line(n), 'no-console-log', 'console.log in application code');
      }
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Function') add(file, line(n), 'no-eval', 'new Function() is forbidden');
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && /^(innerHTML|outerHTML)$/u.test(n.left.name.text) && !ALLOW_HTML_SINK.has(rel)) add(file, line(n), 'no-html-sink', `${n.left.name.text} assignment outside the sanitising component`);
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'dangerouslySetInnerHTML' && !ALLOW_HTML_SINK.has(rel)) add(file, line(n), 'no-html-sink', 'dangerouslySetInnerHTML outside the sanitising component');
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// Safety: no analytics or tracking libraries in package.json
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) if (/analytics|gtag|sentry|segment|mixpanel|hotjar|posthog|amplitude/iu.test(dep)) add(path.join(root, 'package.json'), 1, 'no-tracking', `tracking dependency "${dep}"`);

if (findings.length) { console.error(findings.join('\n')); console.error(`\n${findings.length} lint finding(s).`); process.exit(1); }
console.log(`lint: ${files.length} files checked, 0 findings.`);
