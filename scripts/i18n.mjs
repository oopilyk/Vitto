#!/usr/bin/env node
/**
 * i18n.mjs: finds every string the app translates and keeps the catalogs in step.
 *
 * Strings are written in English where they are used, inside `t()`, `tx()`,
 * `tn()`, `msg()`, `tRich()` or `tParts()` (see packages/core/src/i18n). This
 * reads the source for those calls; the English is the catalog key.
 *
 *   node scripts/i18n.mjs check                    what is missing, unused or broken; exit 1 if anything is missing or broken
 *   node scripts/i18n.mjs keys                     every key with where it is used, as JSON
 *   node scripts/i18n.mjs todo <locale> <dir> [n]  untranslated keys for <locale>, n to a file (default 250), into <dir>
 *   node scripts/i18n.mjs merge <locale> <file...> add { "english": "translation" } files to that locale's catalog
 *   node scripts/i18n.mjs dynamic                  calls whose string is not written in place (each needs msg() somewhere)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(import.meta.url)('typescript');

export const LOCALES = ['es', 'zh-Hans'];
const SOURCES = ['mobile/App.tsx', 'mobile/src', 'packages/core/src'];
const catalogPath = (locale) => path.join(root, 'packages/core/src/i18n', `${locale}.json`);
const CONTEXT = '||';

const walk = (target) => {
  const full = path.join(root, target);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [full];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(target, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : walk(next);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path.join(root, next)] : [];
  });
};

const literal = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null);

/** Every translated string in the source: { keys: Map<key, refs[]>, dynamic: refs[] }. */
export const extract = () => {
  const keys = new Map();
  const dynamic = [];
  const add = (key, ref) => keys.set(key, [...(keys.get(key) ?? []), ref]);
  for (const file of SOURCES.flatMap(walk)) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        const [first, second, third] = node.arguments;
        const ref = `${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
        if (name === 't' || name === 'msg' || name === 'tRich' || name === 'tParts') {
          const text = literal(first);
          if (text !== null) add(text, ref);
          else if (first && name !== 'msg') dynamic.push(`${ref}  ${name}(${first.getText().slice(0, 60)})`);
        } else if (name === 'tx') {
          const context = literal(first);
          const text = literal(second);
          if (context !== null && text !== null) add(`${text}${CONTEXT}${context}`, ref);
          else dynamic.push(`${ref}  tx(…)`);
        } else if (name === 'tn') {
          for (const form of [second, third]) {
            const text = literal(form);
            if (text !== null) add(text, ref);
            else dynamic.push(`${ref}  tn(…)`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { keys, dynamic };
};

const readCatalog = (locale) => JSON.parse(fs.readFileSync(catalogPath(locale), 'utf8'));
const writeCatalog = (locale, catalog) =>
  fs.writeFileSync(catalogPath(locale), `${JSON.stringify(Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)}\n`);

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
const englishOf = (key) => key.split(CONTEXT)[0];

/** What is wrong with a locale's catalog: { missing, unused, broken }. */
export const audit = (locale, keys = extract().keys) => {
  const catalog = readCatalog(locale);
  const missing = [...keys.keys()].filter((key) => typeof catalog[key] !== 'string' || catalog[key] === '');
  const unused = Object.keys(catalog).filter((key) => !keys.has(key));
  // A placeholder the translation dropped or invented would print "{name}" or lose a value.
  const broken = Object.entries(catalog)
    .filter(([key, value]) => keys.has(key) && typeof value === 'string' && placeholders(englishOf(key)) !== placeholders(value))
    .map(([key, value]) => `${key}  ->  ${value}`);
  return { missing, unused, broken };
};

const [command, ...rest] = process.argv.slice(2);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (command === 'keys') {
    process.stdout.write(`${JSON.stringify(Object.fromEntries(extract().keys), null, 2)}\n`);
  } else if (command === 'dynamic') {
    console.log(extract().dynamic.join('\n'));
  } else if (command === 'check') {
    const { keys } = extract();
    let failed = false;
    console.log(`${keys.size} strings`);
    for (const locale of LOCALES) {
      const { missing, unused, broken } = audit(locale, keys);
      console.log(`${locale}: ${missing.length} missing, ${broken.length} with wrong placeholders, ${unused.length} unused`);
      if (rest.includes('--list')) [...missing.map((key) => `  missing: ${key}`), ...broken.map((line) => `  broken: ${line}`), ...unused.map((key) => `  unused: ${key}`)].forEach((line) => console.log(line));
      if (missing.length || broken.length) failed = true;
    }
    process.exit(failed ? 1 : 0);
  } else if (command === 'todo') {
    const [locale, dir, size = '250'] = rest;
    const { keys } = extract();
    const { missing } = audit(locale, keys);
    fs.mkdirSync(dir, { recursive: true });
    // In file order, so one file's strings (one screen's vocabulary) stay together.
    const ordered = missing.sort((a, b) => keys.get(a)[0].localeCompare(keys.get(b)[0], undefined, { numeric: true }));
    const count = Math.ceil(ordered.length / Number(size));
    for (let index = 0; index < count; index += 1) {
      const chunk = ordered.slice(index * Number(size), (index + 1) * Number(size));
      fs.writeFileSync(path.join(dir, `${locale}-todo-${String(index + 1).padStart(2, '0')}.json`), `${JSON.stringify(chunk.map((key) => ({ key, where: keys.get(key).slice(0, 2) })), null, 1)}\n`);
    }
    console.log(`${ordered.length} untranslated for ${locale}, in ${count} file(s) under ${dir}`);
  } else if (command === 'merge') {
    const [locale, ...files] = rest;
    const catalog = readCatalog(locale);
    let added = 0;
    for (const file of files) {
      for (const [key, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
        if (typeof value !== 'string' || !value) continue;
        if (catalog[key] !== value) added += 1;
        catalog[key] = value;
      }
    }
    writeCatalog(locale, catalog);
    console.log(`${locale}: ${added} added or changed, ${Object.keys(catalog).length} in all`);
  } else {
    console.log('usage: node scripts/i18n.mjs check [--list] | keys | dynamic | todo <locale> <dir> [n] | merge <locale> <file...>');
    process.exit(1);
  }
}
