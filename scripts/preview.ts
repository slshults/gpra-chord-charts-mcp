/**
 * Eyeball chord rendering from the terminal:
 *   npx tsx scripts/preview.ts G Am C F Bm D/F#
 */
import { lookupChord } from '../src/data.js';
import { renderChord } from '../src/format.js';

const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.error('usage: tsx scripts/preview.ts <chord> [chord...]');
  process.exit(1);
}

for (const query of queries) {
  const match = lookupChord(query);
  if (match) console.log(`— id ${match.id} —`);
  console.log(match ? renderChord(match) : `no match for "${query}"`);
  console.log('\n');
}
