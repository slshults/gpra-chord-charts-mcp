import type { Barre, Chord, Finger, RawChordRow } from './types.js';

const DEFAULT_TUNING = 'EADGBE';

/**
 * `fingers` appears in two shapes in the source table:
 *   - tuple form   [string, fret]          — the bulk generated set, no finger numbers
 *   - object form  {string, fret, finger}  — the ~20 hand-curated chords
 * Both are accepted; a missing finger number means the chart renders a plain dot.
 *
 * The array check has to come first: arrays are objects too.
 */
const toFinger = (raw: unknown): Finger | null => {
  const fields = Array.isArray(raw)
    ? { string: raw[0], fret: raw[1], finger: raw[2] }
    : (raw as Record<string, unknown> | null);
  if (!fields || typeof fields !== 'object') return null;

  const { string, fret, finger } = fields;
  if (typeof string !== 'number' || typeof fret !== 'number') return null;
  // A stored `null` is not `undefined`; letting it through would make the chart
  // legend describe markers that aren't on the chart.
  return typeof finger === 'number' ? { string, fret, finger } : { string, fret };
};

const toBarre = (raw: unknown): Barre | null => {
  if (!raw || typeof raw !== 'object') return null;
  // Read the keys straight off the row. An earlier version accepted a
  // `{from, to}` alias, but `b.toString ?? b.to` always resolved to
  // Object.prototype.toString, so the alias silently rejected every row it
  // was meant to accept. No row in the snapshot has barres at all; if a data
  // refresh ever adds them, that's the moment to decide their shape.
  const { fromString, toString, fret, finger } = raw as Record<string, unknown>;
  if (typeof fromString !== 'number' || typeof toString !== 'number' || typeof fret !== 'number') {
    return null;
  }
  return typeof finger === 'number'
    ? { fromString, toString, fret, finger }
    : { fromString, toString, fret };
};

const toNumberArray = (raw: unknown): number[] =>
  Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];

const toTuning = (raw: unknown, numStrings: number): string => {
  if (typeof raw === 'string' && raw.length === numStrings) return raw;
  // Some rows elsewhere in the app store tuning as an array of note names.
  if (Array.isArray(raw) && raw.length === numStrings) return raw.join('');
  return DEFAULT_TUNING;
};

const toInt = (raw: unknown, fallback: number): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;

/**
 * Note that `startingFret` and `numFrets` are read from the source row and then
 * deliberately dropped: they are constant defaults (1 and 5) on all 12,708 rows
 * while real fingerings reach fret 16, so they describe nothing. The renderer
 * derives its fret window from the notes instead.
 */
export const normalizeChord = (row: RawChordRow): Chord => {
  const data = row.chord_data ?? {};
  const numStrings = toInt(data.numStrings, 6);

  /** Drop notes that can't be drawn, so a bad row renders short rather than
   *  producing silent column-math nonsense. build-index.ts reports the loss. */
  const playable = (f: Finger): boolean =>
    Number.isInteger(f.string) && f.string >= 1 && f.string <= numStrings && f.fret >= 1;

  return {
    id: row.id,
    name: row.name,
    fingers: (Array.isArray(data.fingers) ? data.fingers : [])
      .map(toFinger)
      .filter((f): f is Finger => f !== null && playable(f)),
    barres: (Array.isArray(data.barres) ? data.barres : [])
      .map(toBarre)
      .filter((b): b is Barre => b !== null),
    openStrings: toNumberArray(data.openStrings),
    mutedStrings: toNumberArray(data.mutedStrings),
    numStrings,
    tuning: toTuning(data.tuning, numStrings),
    capo: toInt(data.capo, 0),
  };
};
