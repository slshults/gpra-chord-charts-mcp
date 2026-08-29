import { readFileSync } from 'node:fs';
import { findChord } from './search.js';
import type { Chord } from './types.js';

/** Resolved relative to this module, which sits one level under the package
 *  root either way (src/ when run with tsx, dist/ when built). */
const DATA_URL = new URL('../data/common-chords.json', import.meta.url);

let cache: Chord[] | null = null;

export const loadChords = (): Chord[] => {
  cache ??= JSON.parse(readFileSync(DATA_URL, 'utf8')) as Chord[];
  return cache;
};

export const getChordById = (id: number): Chord | undefined =>
  loadChords().find((c) => c.id === id);

/** One chord name in, one chart out — the same single result the website shows. */
export const lookupChord = (query: string): Chord | undefined =>
  findChord(loadChords(), query);

