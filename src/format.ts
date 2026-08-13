import { frettedFrets, hasFrettedNotes, type Barre, type Chord, type Finger } from './types.js';

/**
 * Text rendering of a chord chart.
 *
 * Orientation matches the charts on guitarpracticeroutine.com and standard
 * guitar convention: frets run top to bottom (fret 1 nearest the nut), and
 * string 1 — the highest-pitched string — is the RIGHTMOST column. So the
 * columns read low-to-high pitch left to right, like looking at a guitar
 * held up facing you.
 */

const COL_START = 4;
const COL_STEP = 3;
const LABEL_WIDTH = 2;
const MIN_ROWS = 4;

/** A chord reaching no higher than this keeps the nut in view, so low voicings
 *  are drawn in their familiar open-position form rather than floating. */
const NUT_PROXIMITY = 3;

/** Marker used for a fretted note whose finger number isn't recorded. */
const PLAIN_DOT = '*';

const colFor = (stringNumber: number, numStrings: number): number =>
  COL_START + (numStrings - stringNumber) * COL_STEP;

const lineWidth = (numStrings: number): number => colFor(1, numStrings) + 2;

const blank = (numStrings: number): string[] =>
  new Array(lineWidth(numStrings)).fill(' ');

const putAt = (line: string[], col: number, text: string): void => {
  for (let i = 0; i < text.length; i += 1) {
    if (col + i >= 0 && col + i < line.length) line[col + i] = text[i];
  }
};

const fill = (line: string[], from: number, to: number, char: string): void => {
  for (let c = from; c <= to && c < line.length; c += 1) line[c] = char;
};

/** Write one glyph into each string column, left (lowest pitch) to right. */
const eachStringCol = (
  line: string[],
  numStrings: number,
  glyph: (stringNumber: number) => string,
): void => {
  for (let s = 1; s <= numStrings; s += 1) putAt(line, colFor(s, numStrings), glyph(s));
};

/** Horizontal rule across the grid, overhanging the outer strings by a column. */
const fillRule = (line: string[], numStrings: number, char: string): void =>
  fill(line, COL_START - 1, colFor(1, numStrings) + 1, char);

const barreCovers = (barre: Barre, stringNumber: number): boolean =>
  stringNumber >= Math.min(barre.fromString, barre.toString) &&
  stringNumber <= Math.max(barre.fromString, barre.toString);

/** Lowest-fretted entry for a string, so duplicate rows can't hide a note. */
const fingerOn = (chord: Chord, stringNumber: number): Finger | undefined =>
  chord.fingers
    .filter((f) => f.string === stringNumber)
    .sort((a, b) => a.fret - b.fret)[0];

/**
 * Which frets the chart covers.
 *
 * Derived from the notes themselves. The source rows carry `startingFret: 1`
 * and `numFrets: 5` on every single record while actual fingerings run up to
 * fret 16, so those fields are defaults rather than measurements — trusting
 * them silently dropped every note past the fifth fret. They aren't even
 * carried on `Chord` any more.
 */
export interface FretWindow {
  firstFret: number;
  rows: number;
}

export const displayWindow = (chord: Chord): FretWindow => {
  const frets = frettedFrets(chord);
  if (frets.length === 0) return { firstFret: 1, rows: MIN_ROWS };

  const lowest = Math.min(...frets);
  const highest = Math.max(...frets);
  const firstFret = lowest <= NUT_PROXIMITY ? 1 : lowest;
  return { firstFret, rows: Math.max(MIN_ROWS, highest - firstFret + 1) };
};

const markerFor = (chord: Chord, stringNumber: number): string => {
  if (chord.mutedStrings.includes(stringNumber)) return 'x';
  if (chord.openStrings.includes(stringNumber)) return 'o';
  return ' ';
};

/**
 * The universal one-line chord grid: one value per string, low pitch to high.
 * `x` muted, `0` open, a number = fret. e.g. G -> "3 x 0 0 3 3".
 */
export const compactNotation = (chord: Chord): string => {
  const cells: string[] = [];
  for (let d = 0; d < chord.numStrings; d += 1) {
    const stringNumber = chord.numStrings - d;
    const finger = fingerOn(chord, stringNumber);
    const barre = chord.barres.find((b) => barreCovers(b, stringNumber));

    if (finger) cells.push(String(finger.fret));
    // An explicit mute wins over a barre: barring across a string you also
    // damp is a real shape, and the mute is the more important instruction.
    else if (chord.mutedStrings.includes(stringNumber)) cells.push('x');
    else if (barre) cells.push(String(barre.fret));
    else if (chord.openStrings.includes(stringNumber)) cells.push('0');
    else cells.push('-');
  }
  return cells.join(' ');
};

const headerLine = (chord: Chord): string => {
  const line = blank(chord.numStrings);
  // `tuning` is stored low-to-high, and string numbers run high-to-low.
  eachStringCol(line, chord.numStrings, (s) => chord.tuning[chord.numStrings - s] ?? '?');
  return line.join('').trimEnd();
};

const markerLine = (chord: Chord): string => {
  const line = blank(chord.numStrings);
  eachStringCol(line, chord.numStrings, (s) => markerFor(chord, s));
  return line.join('').trimEnd();
};

/** Double rule for the nut, plain rule plus a position label further up. */
const nutLine = (chord: Chord, fretWindow: FretWindow): string => {
  const line = blank(chord.numStrings);
  fillRule(line, chord.numStrings, fretWindow.firstFret === 1 ? '=' : '-');
  const rule = line.join('').trimEnd();
  return fretWindow.firstFret === 1 ? rule : `${rule}  ${fretWindow.firstFret}fr`;
};

const fretRow = (chord: Chord, fret: number): string => {
  const line = blank(chord.numStrings);
  putAt(line, 0, String(fret).padStart(LABEL_WIDTH, ' '));
  eachStringCol(line, chord.numStrings, () => '|');

  for (const barre of chord.barres.filter((b) => b.fret === fret)) {
    const lo = Math.min(barre.fromString, barre.toString);
    const hi = Math.max(barre.fromString, barre.toString);
    fill(line, colFor(hi, chord.numStrings), colFor(lo, chord.numStrings), '=');
    for (let s = lo; s <= hi; s += 1) {
      putAt(line, colFor(s, chord.numStrings), markerForFinger(barre.finger));
    }
  }

  for (const finger of chord.fingers.filter((f) => f.fret === fret)) {
    putAt(line, colFor(finger.string, chord.numStrings), markerForFinger(finger.finger));
  }
  return line.join('').trimEnd();
};

const markerForFinger = (finger: number | undefined): string =>
  finger === undefined ? PLAIN_DOT : String(finger);

const ruleLine = (chord: Chord): string => {
  const line = blank(chord.numStrings);
  fillRule(line, chord.numStrings, '-');
  eachStringCol(line, chord.numStrings, () => '+');
  return line.join('').trimEnd();
};

/** The chord box itself, without surrounding prose. */
export const renderChordBox = (chord: Chord, fretWindow = displayWindow(chord)): string => {
  const lines = [headerLine(chord), markerLine(chord), nutLine(chord, fretWindow)];

  for (let r = 0; r < fretWindow.rows; r += 1) {
    lines.push(fretRow(chord, fretWindow.firstFret + r));
    lines.push(ruleLine(chord));
  }

  return lines.join('\n');
};

/** Anything drawn without a finger number, whether a single note or a barre. */
const anyPlainDots = (chord: Chord): boolean =>
  chord.fingers.some((f) => f.finger === undefined) ||
  chord.barres.some((b) => b.finger === undefined);

const anyFingerNumbers = (chord: Chord): boolean =>
  chord.fingers.some((f) => f.finger !== undefined) ||
  chord.barres.some((b) => b.finger !== undefined);

const legendFor = (chord: Chord): string => {
  const parts = ['x = muted', 'o = open'];
  if (anyPlainDots(chord)) parts.push(`${PLAIN_DOT} = fretted`);
  if (anyFingerNumbers(chord)) {
    parts.push('digits in grid = fingers (1 index, 2 middle, 3 ring, 4 pinky)');
  }
  return parts.join('   ');
};

/** Full text block for one chord: heading, one-line grid, chart, legend. */
export const renderChord = (chord: Chord): string => {
  const fretWindow = displayWindow(chord);
  const position =
    fretWindow.firstFret === 1 ? 'open position' : `${fretWindow.firstFret}fr position`;
  const capo = chord.capo > 0 ? ` · capo ${chord.capo}` : '';

  // A handful of source rows record no fretted notes at all. Rendering the bare
  // grid without saying so would look like a chord you strum entirely open.
  const empty = hasFrettedNotes(chord)
    ? []
    : ['', 'Note: no fretted notes are recorded for this voicing.'];

  return [
    `${chord.name}`,
    `${compactNotation(chord)}   (low to high: ${chord.tuning.split('').join(' ')})`,
    '',
    renderChordBox(chord, fretWindow),
    '',
    legendFor(chord),
    `${chord.tuning} · ${position}${capo}`,
    ...empty,
  ].join('\n');
};
