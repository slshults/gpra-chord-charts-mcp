/**
 * Turn the raw table dump into the snapshot the server ships.
 *
 *   psql "$DATABASE_URL" -Atf scripts/dump-chords.sql > data/common-chords.raw.json
 *   npx tsx scripts/build-index.ts
 *
 * Also reports data anomalies rather than silently normalizing them away — the
 * point is to notice when the source data has a problem, not to paper over it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeChord } from '../src/normalize.js';
import type { Chord, RawChordRow } from '../src/types.js';

const RAW = new URL('../data/common-chords.raw.json', import.meta.url);
const OUT = new URL('../data/common-chords.json', import.meta.url);

const raw = JSON.parse(readFileSync(RAW, 'utf8')) as RawChordRow[];
const chords = raw.map(normalizeChord);

const anomalies: string[] = [];
const note = (label: string, examples: Chord[]) => {
  if (examples.length === 0) return;
  const names = examples.slice(0, 5).map((c) => `${c.name}#${c.id}`).join(', ');
  anomalies.push(`  ${label}: ${examples.length} (e.g. ${names})`);
};

note('no fingers at all', chords.filter((c) => c.fingers.length === 0 && c.barres.length === 0));
note('missing finger numbers', chords.filter((c) => c.fingers.some((f) => f.finger === undefined)));
note(
  'strings unaccounted for (not fretted, open, or muted)',
  chords.filter((c) => {
    const seen = new Set([
      ...c.fingers.map((f) => f.string),
      ...c.openStrings,
      ...c.mutedStrings,
      ...c.barres.flatMap((b) => {
        const lo = Math.min(b.fromString, b.toString);
        const hi = Math.max(b.fromString, b.toString);
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      }),
    ]);
    return seen.size < c.numStrings;
  }),
);
note(
  'three or more notes sharing the lowest fret but no barre recorded',
  chords.filter((c) => {
    if (c.barres.length > 0 || c.fingers.length < 3) return false;
    const lowest = Math.min(...c.fingers.map((f) => f.fret));
    return c.fingers.filter((f) => f.fret === lowest).length >= 3;
  }),
);
note('duplicate string entries', chords.filter((c) => {
  const strings = c.fingers.map((f) => f.string);
  return new Set(strings).size !== strings.length;
}));
note(
  'notes dropped as unplayable (bad string number or fret)',
  chords.filter((c, i) => {
    const rawFingers = raw[i]?.chord_data?.fingers;
    return Array.isArray(rawFingers) && rawFingers.length !== c.fingers.length;
  }),
);

// Printed every build because getting this range wrong once already caused the
// renderer to silently clip every note above the fifth fret.
const allFrets = chords.flatMap((c) => [
  ...c.fingers.map((f) => f.fret),
  ...c.barres.map((b) => b.fret),
]);
const above = (n: number) =>
  chords.filter((c) => c.fingers.some((f) => f.fret > n) || c.barres.some((b) => b.fret > n)).length;

writeFileSync(OUT, JSON.stringify(chords));

const names = new Set(chords.map((c) => c.name));
console.log(`Wrote ${chords.length} chords (${names.size} distinct names) to ${OUT.pathname}`);
console.log(
  `Fret range: ${Math.min(...allFrets)}-${Math.max(...allFrets)}  ` +
    `(above fret 3: ${above(3)}, above fret 5: ${above(5)})`,
);
if (anomalies.length > 0) {
  console.log('\nData notes:');
  console.log(anomalies.join('\n'));
}
