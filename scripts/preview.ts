/**
 * Eyeball chord rendering from the terminal:
 *   npx tsx scripts/preview.ts G Am C F Bm D/F#
 */
import { loadChords } from '../src/data.js';
import { renderChord } from '../src/format.js';
import { searchChords } from '../src/search.js';

const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.error('usage: tsx scripts/preview.ts <chord> [chord...]');
  process.exit(1);
}

const chords = loadChords();
for (const query of queries) {
  const [match] = searchChords(chords, query, { limit: 1 });
  if (match) console.log(`— id ${match.id} —`);
  console.log(match ? renderChord(match) : `no match for "${query}"`);
  console.log('\n');
}
