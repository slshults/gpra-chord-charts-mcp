import { getChordById, lookupChord } from './data.js';
import { SITE } from './links.js';
import type { Chord } from './types.js';

/**
 * Today's Chord of the Day — the same chord posted to Bluesky and Facebook.
 *
 * The chord lives in GPRA's `posted_chords` table, which nothing else exposes,
 * so this is the one thing the server can't answer from its bundled snapshot.
 * It fetches the name and voicing id from the app and renders the chart
 * locally, which keeps the chart identical to every other chart here.
 *
 * Cached for twelve hours: the chord changes once a day, so two fetches a day
 * is already generous and the server stays effectively decoupled from the app.
 * A failed refresh keeps serving the last known chord rather than erroring —
 * a day-old chord of the day is a much better answer than none.
 */

const API_BASE = process.env.GPRA_API_BASE ?? SITE;
const ENDPOINT = `${API_BASE}/api/chord-charts/chord-of-the-day`;
const CACHE_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

interface DailyChord {
  chord_name: string;
  common_chord_id: number | null;
}

let cached: { value: DailyChord; at: number } | null = null;

const fetchDaily = async (): Promise<DailyChord | null> => {
  try {
    const response = await fetch(ENDPOINT, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as Partial<DailyChord>;
    if (typeof body.chord_name !== 'string' || body.chord_name.length === 0) return null;

    return {
      chord_name: body.chord_name,
      common_chord_id: typeof body.common_chord_id === 'number' ? body.common_chord_id : null,
    };
  } catch {
    // Network trouble, a timeout, or the endpoint not deployed yet.
    return null;
  }
};

/** The daily chord, or null when it has never been successfully fetched. */
export const chordOfTheDay = async (): Promise<Chord | null> => {
  const fresh = cached !== null && Date.now() - cached.at < CACHE_MS;
  if (!fresh) {
    const fetched = await fetchDaily();
    if (fetched) cached = { value: fetched, at: Date.now() };
  }
  if (!cached) return null;

  // Prefer the exact voicing id; fall back to the name when the row has none.
  const { chord_name: name, common_chord_id: id } = cached.value;
  return (id !== null ? getChordById(id) : undefined) ?? lookupChord(name) ?? null;
};
