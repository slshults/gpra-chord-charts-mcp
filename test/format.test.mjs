import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyCaller } from '../dist/analytics.js';
import { compactNotation, renderChordBox, renderChord } from '../dist/format.js';
import { normalizeChord } from '../dist/normalize.js';
import { normalizeQuery, searchChords } from '../dist/search.js';
import { loadChords, randomChord } from '../dist/data.js';
import { hasFrettedNotes } from '../dist/types.js';

const chords = loadChords();
const byName = (name) => {
  const found = chords.find((c) => c.name === name);
  assert.ok(found, `expected a chord named ${name} in the library`);
  return found;
};

test('compact notation matches known fingerings, low string to high', () => {
  assert.equal(compactNotation(byName('Am')), 'x 0 2 2 1 0');
  assert.equal(compactNotation(byName('C')), 'x 3 2 0 1 0');
  assert.equal(compactNotation(byName('Em')), '0 2 2 0 0 0');
  assert.equal(compactNotation(byName('F')), '1 3 3 2 1 1');
});

test('chord box puts string 1 (high E) in the rightmost column', () => {
  // D: x x 0 2 3 2 — the high E is fretted at 2, the low two strings muted.
  const lines = renderChordBox(byName('D')).split('\n');
  const header = lines[0];
  const markers = lines[1];

  assert.equal(header.trimEnd().slice(-1), 'E');
  // Muted markers sit on the left (low strings), not the right.
  assert.equal(markers.trimStart()[0], 'x');
  assert.ok(!markers.trimEnd().endsWith('x'));
});

// String columns, left to right = low E to high E.
const STRING_COLS = [4, 7, 10, 13, 16, 19];
/** Grid rows are the ones prefixed with a right-aligned fret number. */
const isGridRow = (line) => /^\s*\d+\s/.test(line);
const gridRowFor = (lines, fret) =>
  lines.find((l) => isGridRow(l) && Number(l.slice(0, 2).trim()) === fret);
/** The six string cells of a grid row, low string first. */
const cellsOf = (line) => STRING_COLS.map((col) => line[col] ?? ' ');

test('chord box rows are labelled by fret and hold the right notes', () => {
  // C is x 3 2 0 1 0, fingered 3rd on the A string, 2nd on D, 1st on B.
  const lines = renderChordBox(byName('C')).split('\n');

  assert.deepEqual(cellsOf(gridRowFor(lines, 3)), ['|', '3', '|', '|', '|', '|']);
  assert.deepEqual(cellsOf(gridRowFor(lines, 2)), ['|', '|', '2', '|', '|', '|']);
  assert.deepEqual(cellsOf(gridRowFor(lines, 1)), ['|', '|', '|', '|', '1', '|']);
});

test('columns stay aligned across every grid row of a chart', () => {
  const lines = renderChordBox(byName('G')).split('\n');
  const gridRows = lines.filter(isGridRow);
  assert.ok(gridRows.length >= 4, 'expected at least four fret rows');

  for (const line of gridRows) {
    for (const cell of cellsOf(line)) {
      // Every string column carries a glyph — a stray space means a column slipped.
      assert.notEqual(cell, ' ', `misaligned column in "${line}"`);
    }
  }
});

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

test('every fretted note reaches the chart, and nothing is invented', () => {
  // Sampled across the whole library rather than a handful of open chords —
  // a clipped fret window once hid a bug affecting 29% of the data.
  const sample = chords.filter((_, i) => i % 250 === 0);
  assert.ok(sample.length > 40, 'expected a broad sample');

  for (const chord of sample) {
    if (chord.fingers.length === 0) continue;
    const cells = parseBox(chord);

    for (const finger of chord.fingers) {
      const glyph = cells.get(`${finger.fret}:${finger.string}`);
      assert.ok(
        glyph !== undefined && glyph !== '|',
        `${chord.name} (#${chord.id}): note at fret ${finger.fret} string ${finger.string} is missing`,
      );
    }

    const drawn = [...cells.values()].filter((g) => g !== '|' && g !== ' ').length;
    assert.equal(
      drawn,
      new Set(chord.fingers.map((f) => `${f.fret}:${f.string}`)).size,
      `${chord.name} (#${chord.id}): chart shows notes the data doesn't have`,
    );
  }
});

test('the compact grid and the chart never disagree', () => {
  // The bug that shipped was two representations of one chord contradicting
  // each other, so this cross-checks them rather than each against the data.
  const sample = chords.filter((_, i) => i % 250 === 0);

  for (const chord of sample) {
    const cells = parseBox(chord);
    const compact = compactNotation(chord).split(' ');

    compact.forEach((cell, d) => {
      const stringNumber = chord.numStrings - d;
      if (!/^\d+$/.test(cell)) return; // x, 0 and - aren't drawn in the grid
      assert.notEqual(
        cells.get(`${cell}:${stringNumber}`),
        '|',
        `${chord.name} (#${chord.id}): grid says fret ${cell} on string ${stringNumber}, chart is empty there`,
      );
    });
  }
});

test('voicings up the neck get their own window and a position label', () => {
  const high = chords.find((c) => c.fingers.every((f) => f.fret >= 8) && c.fingers.length >= 3);
  assert.ok(high, 'expected a voicing entirely above the 8th fret');

  const rendered = renderChord(high);
  const lowest = Math.min(...high.fingers.map((f) => f.fret));

  assert.ok(rendered.includes(`${lowest}fr`), 'position label present');
  assert.ok(!rendered.includes('open position'), 'not labelled open position');
  assert.ok(!rendered.includes('=================='), 'no nut drawn away from the nut');

  const cells = parseBox(high);
  for (const finger of high.fingers) {
    assert.notEqual(cells.get(`${finger.fret}:${finger.string}`), '|');
  }
});

test('a chord reaching the nut keeps the nut in view', () => {
  const rendered = renderChord(byName('C')); // x 3 2 0 1 0
  assert.ok(rendered.includes('=================='), 'nut drawn');
  assert.ok(rendered.includes('open position'));
  assert.ok(!rendered.includes('fr\n'), 'no position label needed');
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
  const lines = renderChordBox(barred).split('\n');
  const fret1 = gridRowFor(lines, 1);

  assert.deepEqual(cellsOf(fret1), ['1', '1', '1', '1', '1', '1']);
  assert.ok(fret1.includes('1==1'), 'barre span is connected');
  // Cells run string 6, 5, 4, 3, 2, 1 — the fret-3 note is on string 4.
  assert.equal(compactNotation(barred), '1 1 3 1 1 1');
});

test('an explicit mute outranks a barre in the compact grid', () => {
  const barredWithMute = {
    id: 0,
    name: 'Synthetic',
    fingers: [],
    barres: [{ fromString: 1, toString: 6, fret: 1 }],
    openStrings: [],
    mutedStrings: [6],
    numStrings: 6,
    tuning: 'EADGBE',
    capo: 0,
  };
  assert.equal(compactNotation(barredWithMute), 'x 1 1 1 1 1');
});

test('fretted notes without finger numbers render as plain dots', () => {
  const rendered = renderChord(byName('F'));
  assert.ok(rendered.includes('*'), 'expected plain dot markers');
  assert.ok(rendered.includes('* = fretted'));
  assert.ok(!rendered.includes('1 index'), 'no finger legend when numbers are absent');
});

test('curated chords keep their finger numbers', () => {
  const rendered = renderChord(byName('Am'));
  assert.ok(rendered.includes('1 index, 2 middle, 3 ring, 4 pinky'));
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

test('query normalization folds what an assistant is likely to send', () => {
  assert.equal(normalizeQuery('  G major chord '), 'g');
  assert.equal(normalizeQuery('C♯m7'), 'c#m7');
  assert.equal(normalizeQuery('B♭'), 'bb');
  assert.equal(normalizeQuery('A minor'), 'am');
  assert.equal(normalizeQuery('A-minor'), 'am');
  assert.equal(normalizeQuery('C major 7'), 'c7');
  assert.equal(normalizeQuery('Cmaj7'), 'cmaj7', 'maj is not major');
});

test('search ranks the plain chord ahead of exotic names containing it', () => {
  const results = searchChords(chords, 'G', { limit: 5 });
  assert.equal(results[0].name, 'G');
  for (let i = 1; i < results.length; i += 1) {
    assert.ok(
      results[i - 1].name.length <= results[i].name.length,
      `${results[i - 1].name} should not follow ${results[i].name}`,
    );
  }
});

test('a flat or sharp is not offered as an alternative to the natural root', () => {
  // Ab is a different root than A, so it shouldn't beat Am/A7 for query "A".
  for (const root of ['A', 'G', 'E', 'B']) {
    const top = searchChords(chords, root, { limit: 3 }).map((c) => c.name);
    assert.equal(top[0], root);
    assert.ok(
      !top.slice(1).some((n) => n === `${root}b` || n === `${root}#`),
      `${root} search surfaced an accidental: ${top.join(', ')}`,
    );
  }
});

test('a collapsed nonsense query returns nothing rather than a confident guess', () => {
  // "minor" normalizes to "m", which would substring-match thousands of chords.
  assert.deepEqual(searchChords(chords, 'minor', { limit: 3 }), []);
});

test('search finds slash chords and returns nothing for gibberish', () => {
  assert.equal(searchChords(chords, 'D/F#', { limit: 1 })[0].name, 'D/F#');
  assert.deepEqual(searchChords(chords, 'zzzz', { limit: 3 }), []);
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
    chord_data: {
      fingers: [[5, 2], [99, 2], [0, 1], [4, 0], [3, -1]],
      numStrings: 6,
    },
    order_col: 0,
  });
  // Only the one valid entry survives: string 99 and 0 are off the neck,
  // fret 0 is an open string not a fretted note, fret -1 is nonsense.
  assert.deepEqual(chord.fingers, [{ string: 5, fret: 2 }]);
});

test('random chords always have something drawn on them', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.ok(hasFrettedNotes(randomChord()));
  }
});

test('caller classification separates vendors, crawlers and scanners', () => {
  const kind = (userAgent, clientName) =>
    classifyCaller({ distinctId: 'x', userAgent, clientName });

  assert.equal(kind('Claude-User/1.0'), 'claude');
  assert.equal(kind('', 'claude-ai'), 'claude');
  assert.equal(kind('ChatGPT-User/1.0'), 'openai');

  // Vendor crawlers must not land in the vendor buckets.
  assert.equal(kind('ClaudeBot/1.0 (+claudebot@anthropic.com)'), 'crawler');
  assert.equal(kind('GPTBot/1.2'), 'crawler');

  assert.equal(kind('', 'cursor-vscode'), 'coding_harness');
  assert.equal(kind('', 'gemini-cli'), 'coding_harness');
  assert.equal(kind('SentinelOracle/1.0'), 'scanner');
  assert.equal(kind('l9explore/1.3.0'), 'scanner');
  assert.equal(kind('python-httpx/0.27.0'), 'script');
  assert.equal(kind('okhttp/4.12.0'), 'script');
  assert.equal(kind('node'), 'unknown');

  // "-ized" words must not be read as the Zed editor.
  assert.equal(kind('Mozilla/5.0 (compatible; Optimized-Feed/1.0)'), 'unknown');
  assert.equal(kind('CustomizedAgent/1.0'), 'unknown');
});
