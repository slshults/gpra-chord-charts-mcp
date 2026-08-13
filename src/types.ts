/** A single fretted note. `finger` is absent for most of the library — only the
 *  hand-curated chords at the low end of the id range carry finger numbers. */
export interface Finger {
  string: number;
  fret: number;
  finger?: number;
}

/** A barre. Absent throughout the current snapshot, but the schema allows it and
 *  a future data refresh could add them, so the renderer handles it. */
export interface Barre {
  fromString: number;
  toString: number;
  fret: number;
  finger?: number;
}

export interface Chord {
  id: number;
  name: string;
  fingers: Finger[];
  barres: Barre[];
  /** String numbers played open. 1 = highest-pitched string (rightmost on a chart). */
  openStrings: number[];
  /** String numbers not played. */
  mutedStrings: number[];
  numStrings: number;
  /** Low-to-high, one character per string, e.g. "EADGBE". */
  tuning: string;
  capo: number;
}

/** Shape of a row as dumped from the `common_chords` table. */
export interface RawChordRow {
  id: number;
  name: string;
  chord_data: Record<string, unknown> | null;
  order_col: number | null;
}

/** Every fret a finger or barre sits on. These are facts about the row rather
 *  than about drawing it, so the renderer and the data layer share them. */
export const frettedFrets = (chord: Chord): number[] => [
  ...chord.fingers.map((f) => f.fret),
  ...chord.barres.map((b) => b.fret),
];

/** False for the handful of rows that record no fretted notes at all. */
export const hasFrettedNotes = (chord: Chord): boolean => frettedFrets(chord).length > 0;
