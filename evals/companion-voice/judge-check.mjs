#!/usr/bin/env node
// Sanity check for the judge, before its scores are trusted. For each case
// that already has a frozen baseline reply, the judge compares that reply with
// three replies that must lose: an empty one, "I don't know", and a dry
// informational answer with no personality. Passing = the real reply wins all
// three (a tie or "both bad" counts as a miss).
//
//   node evals/companion-voice/judge-check.mjs --flow .claude/hillclimb/companion-voice
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextFor, judge, loadCases } from './app.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chatRequest } = await import(join(REPO, 'supabase/functions/_shared/chatRequest.ts'));

const flow = process.argv[process.argv.indexOf('--flow') + 1];
if (!flow || process.argv.indexOf('--flow') < 0) {
  console.error('usage: node judge-check.mjs --flow DIR');
  process.exit(2);
}

const BAD = {
  empty: '',
  idk: "I don't know.",
  informational:
    'A balanced choice would be a lean protein (about 6 oz of chicken or fish), a serving of complex carbohydrates such as rice, and a portion of vegetables. This keeps you on track for your calorie and protein targets.',
};

const cases = (await loadCases()).filter((c) => existsSync(join(flow, 'baseline', 'ref', c.id)));
if (!cases.length) {
  console.error('no frozen baseline replies yet: run the baseline pilot first');
  process.exit(2);
}

const results = [];
for (const c of cases) {
  const ref = readFileSync(join(flow, 'baseline', 'ref', c.id), 'utf8');
  const { ctx, turns } = contextFor(c);
  const system = chatRequest(ctx, turns, 'claude-sonnet-5').system.map((b) => b.text).join('\n\n');
  const conversation = [...c.history.map((m) => `${m.role === 'user' ? 'Owner' : 'Pet'}: ${m.content}`), `Owner: ${c.prompt}`].join('\n');
  for (const [kind, bad] of Object.entries(BAD)) {
    const refIsA = Math.random() < 0.5;
    const v = await judge(system, conversation, refIsA ? ref : bad, refIsA ? bad : ref);
    const pass = v.winner === (refIsA ? 'A' : 'B');
    results.push({ case: c.id, kind, pass, winner: v.winner, ref_was: refIsA ? 'A' : 'B', reasoning: v.reasoning, judge_model: v.judge_model, judge_usage: v.judge_usage });
    console.log(`${pass ? 'PASS' : 'MISS'}  ${c.id}  vs ${kind}  (${v.winner})`);
  }
}
writeFileSync(join(flow, 'judge-check.json'), JSON.stringify(results, null, 2));
const passed = results.filter((r) => r.pass).length;
console.log(`\njudge check: ${passed}/${results.length} passed -> ${join(flow, 'judge-check.json')}`);
process.exit(passed === results.length ? 0 : 1);
