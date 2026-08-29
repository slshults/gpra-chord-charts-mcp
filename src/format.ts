import { hasFrettedNotes, type Barre, type Chord, type Finger } from './types.js';

/**
 * Text rendering of a chord chart.
 *
 * This deliberately mirrors what guitarpracticeroutine.com/find-a-chord-chart
 * draws, rather than improving on it: a fixed five-fret grid with the nut at
 * the top, frets counted downward from the nut, and string 1 — the
 * highest-pitched string — in the RIGHTMOST column. The app renders SVGuitar
 * with `numFrets: 5` and `startingFret: 1` on every chart and does not attempt
 * to render a starting fret; that was a deliberate product decision.
 *
 * The one thing this adds: the app silently drops notes above fret 5 (they are
 * emitted below the SVG viewBox and clipped away), which makes a chord look
 * like a different, smaller chord. A text chart can say what a picture can't,
 * so notes outside the grid are named underneath instead of vanishing.
 */

const COL_START = 4;
const COL_STEP = 3;
const LABEL_WIDTH = 2;

/** The app's SVGuitar config: five fret rows, always starting at the nut. */
const GRID_ROWS = 5;
const FIRST_FRET = 1;

/** Marker used for a fretted note whose finger number isn't recorded. */
const PLAIN_DOT = '*';

const colFor = (stringNumber: number, numStrings: number): number =>
  COL_START + (numStrings - stringNumber) * COL_STEP;

const blank = (numStrings: number): string[] =>
  new Array(colFor(1, numStrings) + 2).fill(' ');

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

/**
 * Whether a fret NUMBER falls inside the drawn grid.
 *
 * Everything in this module reasons about fret numbers and string numbers only,
 * never about pitch. That distinction is load-bearing on a guitar: "higher" is
 * ambiguous between a larger fret number and a higher-pitched note, and the two
 * don't correspond — the same fret number sounds a different pitch on every
 * string, and which string carries a chord's lowest-pitched note depends on the
 * voicing and the tuning. Naming things `onGrid`/`maxFretNumber` rather than
 * `high`/`low` keeps that confusion out of the code.
 */
const onGrid = (fret: number): boolean => fret >= FIRST_FRET && fret < FIRST_FRET + GRID_ROWS;

const barreCovers = (barre: Barre, stringNumber: number): boolean =>
  stringNumber >= Math.min(barre.fromString, barre.toString) &&
  stringNumber <= Math.max(barre.fromString, barre.toString);

/** Lowest-fretted entry for a string, so duplicate rows can't hide a note. */
const fingerOn = (chord: Chord, stringNumber: number): Finger | undefined =>
  chord.fingers
    .filter((f) => f.string === stringNumber)
    .sort((a, b) => a.fret - b.fret)[0];

/**
 * Names a string for prose.
 *
 * Always leads with the string NUMBER, because the open-note letter alone is
 * ambiguous: in standard tuning both string 6 and string 1 are E, and 2,938 of
 * the voicings with off-grid notes have one on a string whose letter is shared.
 * "E string, fret 7" could mean either end of the neck.
 */
const stringLabel = (chord: Chord, stringNumber: number): string =>
  `string ${stringNumber} (${chord.tuning[chord.numStrings - stringNumber] ?? '?'})`;

const markerFor = (chord: Chord, stringNumber: number): string => {
  if (chord.mutedStrings.includes(stringNumber)) return 'x';
  if (chord.openStrings.includes(stringNumber)) return 'o';
  return ' ';
};

const markerForFinger = (finger: number | undefined): string =>
  finger === undefined ? PLAIN_DOT : String(finger);

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

const nutLine = (chord: Chord): string => {
  const line = blank(chord.numStrings);
  fillRule(line, chord.numStrings, '=');
  return line.join('').trimEnd();
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

const ruleLine = (chord: Chord): string => {
  const line = blank(chord.numStrings);
  fillRule(line, chord.numStrings, '-');
  eachStringCol(line, chord.numStrings, () => '+');
  return line.join('').trimEnd();
};

/** The chord box itself — always the app's five-fret, nut-at-top grid. */
export const renderChordBox = (chord: Chord): string => {
  const lines = [headerLine(chord), markerLine(chord), nutLine(chord)];
  for (let r = 0; r < GRID_ROWS; r += 1) {
    lines.push(fretRow(chord, FIRST_FRET + r));
    lines.push(ruleLine(chord));
  }
  return lines.join('\n');
};

/**
 * Notes this library records above the fifth fret, described in words.
 *
 * The app's grid can't show these and drops them without saying so. Naming them
 * keeps the chart honest without introducing starting-fret rendering, which is
 * the thing that was deliberately left to the user.
 */
const offGridNotes = (chord: Chord): string[] => {
  const notes = chord.fingers
    .filter((f) => !onGrid(f.fret))
    .sort((a, b) => a.fret - b.fret || b.string - a.string)
    .map((f) => `${stringLabel(chord, f.string)} fret ${f.fret}`);

  const barres = chord.barres
    .filter((b) => !onGrid(b.fret))
    .map((b) => `barre at fret ${b.fret}`);

  return [...notes, ...barres];
};

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

/** Full text block for one chord: heading, chart, legend, any off-grid notes. */
export const renderChord = (chord: Chord): string => {
  const capo = chord.capo > 0 ? ` · capo ${chord.capo}` : '';
  const offGrid = offGridNotes(chord);

  const trailer: string[] = [];
  if (offGrid.length > 0) {
    trailer.push(
      '',
      `Also fretted, past this five-fret grid: ${offGrid.join(', ')}.`,
      'Charts here start at the nut, so those notes sit below the grid.',
    );
  }
  // A handful of source rows record no fretted notes at all. Rendering the bare
  // grid without saying so would look like a chord you strum entirely open.
  if (!hasFrettedNotes(chord)) {
    trailer.push('', 'Note: no fretted notes are recorded for this voicing.');
  }

  return [
    `${chord.name}`,
    '',
    renderChordBox(chord),
    '',
    legendFor(chord),
    `${chord.tuning}${capo}`,
    ...trailer,
  ].join('\n');
};
