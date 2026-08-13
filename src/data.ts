import { readFileSync } from 'node:fs';
import { searchChords } from './search.js';
import { hasFrettedNotes, type Chord } from './types.js';

/** Resolved relative to this module, which sits one level under the package
 *  root either way (src/ when run with tsx, dist/ when built). */
const DATA_URL = new URL('../data/common-chords.json', import.meta.url);

let cache: Chord[] | null = null;
let playableCache: Chord[] | null = null;

export const loadChords = (): Chord[] => {
  cache ??= JSON.parse(readFileSync(DATA_URL, 'utf8')) as Chord[];
  return cache;
};

export const getChordById = (id: number): Chord | undefined =>
  loadChords().find((c) => c.id === id);

export const searchLibrary = (query: string, limit: number): Chord[] =>
  searchChords(loadChords(), query, { limit });

/**
 * A random chord that actually draws something.
 *
 * 16 rows in the snapshot record no fretted notes; they render as an empty grid,
 * which is useless as a practice prompt. Filtering here makes that guarantee
 * total, where the caller-side retry loop it replaces was merely probable.
 */
export const randomChord = (): Chord => {
  playableCache ??= loadChords().filter(hasFrettedNotes);
  return playableCache[Math.floor(Math.random() * playableCache.length)];
};
