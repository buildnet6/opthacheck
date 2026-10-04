// Held-out benchmark: `node tests/heldout.mjs`
import { HELDOUT } from './heldout.js';
import { scoreCase, summarise } from '../js/evaluate.js';
const results = HELDOUT.map(c => scoreCase(c));
for (const r of results) {
  const bad = r.rows.filter(x => !['correct', 'ambiguity caught'].includes(x.result));
  console.log(`${bad.length ? '✗' : '✓'} ${r.id} ${r.title}: ${r.correct}/${r.total}`);
  for (const x of bad) console.log(`    ${x.result.padEnd(16)} ${x.field.padEnd(16)} expected ${JSON.stringify(x.expected)} got ${JSON.stringify(x.got)}`);
}
console.log('\nSummary', summarise(results));
