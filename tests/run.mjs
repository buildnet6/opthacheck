// Synthetic benchmark runner: `node tests/run.mjs` (add --verbose for every field).
// Writes tests/results/<version>.json so performance can be compared across versions (Bible §20 step 10).
import { writeFileSync, mkdirSync } from 'node:fs';
import { CASES } from './cases.js';
import { scoreCase, summarise } from '../js/evaluate.js';
import { VERSION } from '../js/schema.js';

const verbose = process.argv.includes('--verbose');
const results = CASES.map(c => scoreCase(c));
for (const r of results) {
  const bad = r.rows.filter(x => !['correct', 'ambiguity caught'].includes(x.result));
  const flagNote = r.flags.expected.length || r.flags.falseAlarms.length ? ` | red flags ${r.flags.hit}/${r.flags.expected.length}${r.flags.falseAlarms.length ? ` (+${r.flags.falseAlarms.join(',')})` : ''}` : '';
  console.log(`${bad.length ? '✗' : '✓'} ${r.id} ${r.title}: ${r.correct}/${r.total} fields${r.ambiguity.total ? ` | ambiguity ${r.ambiguity.caught}/${r.ambiguity.total}` : ''}${flagNote}`);
  for (const x of verbose ? r.rows : bad) console.log(`    ${x.result.padEnd(16)} ${x.field.padEnd(16)} expected ${JSON.stringify(x.expected)} got ${JSON.stringify(x.got)}`);
}
const s = summarise(results);
console.log('\nSummary', s);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/v${VERSION}.json`, import.meta.url), JSON.stringify({ version: VERSION, at: new Date().toISOString(), summary: s, cases: results.map(({ values, runs, ...r }) => r) }, null, 1));
const failures = results.filter(r => r.flags.hit < r.flags.expected.length);
if (failures.length) { console.error(`Red-flag sensitivity failure in ${failures.map(f => f.id).join(', ')}`); process.exit(1); }
