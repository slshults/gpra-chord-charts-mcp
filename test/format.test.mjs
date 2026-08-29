import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderChordBox, renderChord } from '../dist/format.js';
import { normalizeChord } from '../dist/normalize.js';
import { findChord } from '../dist/search.js';
import { loadChords, lookupChord } from '../dist/data.js';

const chords = loadChords();
const byName = (name) => {
  const found = chords.find((c) => c.name === name);
  assert.ok(found, `expected a chord named ${name} in the library`);
  return found;
};

// String columns, left to right = low E to high E.
const STRING_COLS = [4, 7, 10, 13, 16, 19];
/** Grid rows are the ones prefixed with a right-aligned fret number. */
const isGridRow = (line) => /^\s*\d+\s/.test(line);
const cellsOf = (line) => STRING_COLS.map((col) => line[col] ?? ' ');
const gridRowFor = (lines, fret) =>
  lines.find((l) => isGridRow(l) && Number(l.slice(0, 2).trim()) === fret);

/** Map every grid cell of a rendered box: "fret:stringNumber" -> glyph. */
const parseBox = (chord) => {
  const cells = new Map();
  for (const line of renderChordBox(chord).split('\n').filter(isGridRow)) {
    const fret = Number(line.slice(0, 2).trim());
    STRING_COLS.forEach((col, d) => {
      cells.set(`${fret}:${chord.numStrings - d}`, line[col] ?? ' ');
    });
  }
  return cells;
};

test('the grid always matches the app: five frets, nut at top, no position label', () => {
  // The website renders SVGuitar with numFrets 5 and startingFret 1 on every
  // chart. Low chords and high chords must be drawn identically.
  for (const name of ['Am', 'C', 'F', 'G#m']) {
    const lines = renderChordBox(byName(name)).split('\n');
    const gridRows = lines.filter(isGridRow);

    assert.equal(gridRows.length, 5, `${name}: expected exactly five fret rows`);
    assert.equal(Number(gridRows[0].slice(0, 2).trim()), 1, `${name}: first row is fret 1`);
    assert.ok(lines.some((l) => l.includes('=====')), `${name}: nut drawn`);
    assert.ok(!/\d+fr/.test(lines.join('\n')), `${name}: no position label`);
  }
});

test('known fingerings land on the right cells', () => {
  // C is x 3 2 0 1 0 — 3rd on the A string, 2nd on D, 1st on B.
  const c = parseBox(byName('C'));
  assert.deepEqual([...STRING_COLS.keys()].map((d) => c.get(`3:${6 - d}`)), ['|', '3', '|', '|', '|', '|']);
  assert.deepEqual([...STRING_COLS.keys()].map((d) => c.get(`2:${6 - d}`)), ['|', '|', '2', '|', '|', '|']);
  assert.deepEqual([...STRING_COLS.keys()].map((d) => c.get(`1:${6 - d}`)), ['|', '|', '|', '|', '1', '|']);
});

/**
 * Read a chart purely by column position, left to right, using NO string-number
 * arithmetic. Every other test derives columns the same way the renderer does
 * (`numStrings - d`), so they'd all pass together if that inversion were
 * reversed — a mirrored chart looks like a perfectly valid chord, just the
 * wrong one. This reads the picture the way a person does.
 */
const readColumnsLeftToRight = (chord) => {
  const lines = renderChordBox(chord).split('\n');
  const markers = lines[1];
  return STRING_COLS.map((col) => {
    const marked = markers[col];
    if (marked === 'x' || marked === 'o') return marked;
    const row = lines.filter(isGridRow).find((l) => /[1-4*]/.test(l[col] ?? ' '));
    return row ? row.slice(0, 2).trim() : '-';
  });
};

test('columns read thickest string to thinnest, left to right', () => {
  // Anchored on facts from outside this codebase: read from the thickest
  // string to the thinnest, D is x x 0 2 3 2 and Am is x 0 2 2 1 0. If the
  // string-number inversion were reversed these would come back mirrored.
  assert.deepEqual(readColumnsLeftToRight(byName('D')), ['x', 'x', 'o', '2', '3', '2']);
  assert.deepEqual(readColumnsLeftToRight(byName('Am')), ['x', 'o', '2', '2', '1', 'o']);

  // The tuning header must agree, and its two E's are distinguished only by
  // position — leftmost is the thick E, rightmost the thin one.
  const header = renderChordBox(byName('D')).split('\n')[0];
  assert.deepEqual(STRING_COLS.map((col) => header[col]), ['E', 'A', 'D', 'G', 'B', 'E']);
});

test('every on-grid note is drawn and nothing is invented', () => {
  const sample = chords.filter((_, i) => i % 250 === 0);
  assert.ok(sample.length > 40, 'expected a broad sample');

  for (const chord of sample) {
    const cells = parseBox(chord);
    const onGrid = chord.fingers.filter((f) => f.fret >= 1 && f.fret <= 5);

    for (const finger of onGrid) {
      assert.notEqual(
        cells.get(`${finger.fret}:${finger.string}`),
        '|',
        `${chord.name} (#${chord.id}): note at fret ${finger.fret} string ${finger.string} missing`,
      );
    }
    const drawn = [...cells.values()].filter((g) => g !== '|' && g !== ' ').length;
    assert.equal(
      drawn,
      new Set(onGrid.map((f) => `${f.fret}:${f.string}`)).size,
      `${chord.name} (#${chord.id}): chart shows notes the data doesn't have`,
    );
  }
});

test('notes past the fifth fret are named rather than silently dropped', () => {
  // G#m is 4 6 6 4 4 4 — the two fret-6 notes fall outside the app's grid,
  // where the website drops them without saying so.
  const rendered = renderChord(byName('G#m'));

  assert.ok(rendered.includes('past this five-fret grid'), 'off-grid notes announced');
  assert.ok(rendered.includes('fret 6'), 'the specific fret is named');
  assert.match(rendered, /string 5 \(A\)/, 'the specific string is named by number');
  // The grid itself is unchanged — still five rows.
  assert.equal(renderChordBox(byName('G#m')).split('\n').filter(isGridRow).length, 5);
});

test('a chord entirely inside the grid says nothing about off-grid notes', () => {
  assert.ok(!renderChord(byName('Am')).includes('past this five-fret grid'));
});

test('barres render as a connected span across the strings', () => {
  const barred = {
    id: 0,
    name: 'Synthetic',
    fingers: [{ string: 4, fret: 3, finger: 3 }],
    barres: [{ fromString: 1, toString: 6, fret: 1, finger: 1 }],
    openStrings: [],
    mutedStrings: [],
    numStrings: 6,
    tuning: 'EADGBE',
    capo: 0,
  };
  const fret1 = gridRowFor(renderChordBox(barred).split('\n'), 1);
  assert.deepEqual(cellsOf(fret1), ['1', '1', '1', '1', '1', '1']);
  assert.ok(fret1.includes('1==1'), 'barre span is connected');
});

test('fretted notes without finger numbers render as plain dots', () => {
  const rendered = renderChord(byName('F'));
  assert.ok(rendered.includes('*'), 'expected plain dot markers');
  assert.ok(rendered.includes('* = fretted'));
  assert.ok(!rendered.includes('1 index'), 'no finger legend when numbers are absent');
});

test('curated chords keep their finger numbers', () => {
  assert.ok(renderChord(byName('Am')).includes('1 index, 2 middle, 3 ring, 4 pinky'));
});

test('normalizeChord accepts both stored finger formats', () => {
  const tupleForm = normalizeChord({
    id: 1,
    name: 'T',
    chord_data: { fingers: [[5, 2], [4, 3, 2]], numStrings: 6 },
    order_col: 0,
  });
  assert.deepEqual(tupleForm.fingers, [
    { string: 5, fret: 2 },
    { string: 4, fret: 3, finger: 2 },
  ]);

  const objectForm = normalizeChord({
    id: 2,
    name: 'O',
    chord_data: { fingers: [{ string: 3, fret: 1, finger: 1 }], numStrings: 6 },
    order_col: 0,
  });
  assert.deepEqual(objectForm.fingers, [{ string: 3, fret: 1, finger: 1 }]);
});

test('normalize accepts the recorded barre shape and rejects malformed ones', () => {
  const ok = normalizeChord({
    id: 1,
    name: 'B',
    chord_data: { barres: [{ fromString: 1, toString: 6, fret: 2, finger: 1 }], numStrings: 6 },
    order_col: 0,
  });
  assert.deepEqual(ok.barres, [{ fromString: 1, toString: 6, fret: 2, finger: 1 }]);

  const missingFret = normalizeChord({
    id: 2,
    name: 'B',
    chord_data: { barres: [{ fromString: 1, toString: 6 }], numStrings: 6 },
    order_col: 0,
  });
  assert.deepEqual(missingFret.barres, []);
});

test('normalize drops notes that could not be drawn', () => {
  const chord = normalizeChord({
    id: 1,
    name: 'Bad',
    chord_data: { fingers: [[5, 2], [99, 2], [0, 1], [4, 0], [3, -1]], numStrings: 6 },
    order_col: 0,
  });
  assert.deepEqual(chord.fingers, [{ string: 5, fret: 2 }]);
});

test('lookup returns exactly one chord, exact match winning over substring', () => {
  assert.equal(lookupChord('G').name, 'G');
  assert.equal(lookupChord('am7').name, 'Am7', 'match is case-insensitive');
  assert.equal(lookupChord('D/F#').name, 'D/F#');
  assert.equal(lookupChord('zzzz'), undefined);
});

test('lookup falls back to substring in library order, like the app', () => {
  // No chord is literally named "maj13", so this exercises the fallback and
  // must return the first such row in snapshot order, not a ranked pick.
  const expected = chords.find((c) => c.name.toLowerCase().includes('maj13'));
  assert.equal(findChord(chords, 'maj13'), expected);
});

test('an off-grid note names its string by number, not just its letter', () => {
  // In standard tuning strings 6 and 1 are both E, so "E string, fret 7" is
  // ambiguous. 2,938 voicings with off-grid notes hit that case.
  const am9 = renderChord(byName('Am9'));
  assert.match(am9, /string 1 \(E\)/, 'string identified by number');
  assert.ok(!/\bE string\b/.test(am9), 'bare letter naming must not come back');
});
