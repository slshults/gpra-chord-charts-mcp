import type { Chord } from './types.js';

const NOTE_LETTERS = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']);

/**
 * Normalize a user/agent-supplied chord name so near-misses still land.
 * The library stores names like "C#m7b5/G#", so we fold the unicode accidentals
 * an LLM is likely to emit and strip the filler words a natural-language
 * request tends to carry ("G major chord", "A-minor").
 *
 * "major"/"minor" are replaced wherever they appear rather than only at the end,
 * so "C major 7" lands on "c7". The shorter "maj" is left alone — it's part of
 * real names like "Cmaj7".
 */
export const normalizeQuery = (raw: string): string =>
  raw
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/chord/gi, '')
    .replace(/major/gi, '')
    .replace(/minor/gi, 'm')
    .replace(/[-_\s]/g, '')
    .toLowerCase();

interface Rank {
  tier: 0 | 1 | 2;
  /** Within the prefix tier, a match that changes the root sorts last. */
  accidental: 0 | 1;
}

const rankOf = (needle: string, name: string): Rank | null => {
  if (name === needle) return { tier: 0, accidental: 0 };
  if (name.startsWith(needle)) {
    // "Ab" is a different root than "A", so it shouldn't outrank "Am"/"A7"
    // when someone asks for "A".
    const next = name[needle.length];
    return { tier: 1, accidental: next === 'b' || next === '#' ? 1 : 0 };
  }
  if (name.includes(needle)) return { tier: 2, accidental: 0 };
  return null;
};

export interface SearchOptions {
  limit: number;
}

/**
 * Rank matches: exact name, then prefix, then substring. Within a tier, shorter
 * names first — so searching "G" surfaces G, G5, G7 ahead of "Gbmmaj13/G#".
 */
export const searchChords = (
  chords: Chord[],
  query: string,
  { limit }: SearchOptions,
): Chord[] => {
  const needle = normalizeQuery(query);
  if (!needle) return [];
  // A bare letter that isn't a note name (e.g. "minor" collapsing to "m")
  // would substring-match thousands of chords and look like a real answer.
  if (needle.length === 1 && !NOTE_LETTERS.has(needle)) return [];

  const scored: Array<{ chord: Chord; rank: Rank }> = [];
  for (const chord of chords) {
    const rank = rankOf(needle, chord.name.toLowerCase());
    if (rank !== null) scored.push({ chord, rank });
  }

  scored.sort((a, b) => {
    if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
    if (a.rank.accidental !== b.rank.accidental) return a.rank.accidental - b.rank.accidental;
    if (a.chord.name.length !== b.chord.name.length) {
      return a.chord.name.length - b.chord.name.length;
    }
    return a.chord.id - b.chord.id;
  });

  return scored.slice(0, limit).map((s) => s.chord);
};
