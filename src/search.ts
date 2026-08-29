import type { Chord } from './types.js';

/**
 * Chord lookup, matching the website's behaviour exactly.
 *
 * `/api/chord-charts/common/search` tries a case-insensitive exact match first
 * and falls back to a substring match, both ordered by `order_col, id`; the page
 * then takes the first result and renders that one chart. The bundled snapshot
 * is built in that same order, so array order *is* the app's order and "first
 * match" means the same row the website would show.
 *
 * There is deliberately no query cleanup here. The site passes whatever was
 * typed straight to the API, and an assistant is better placed than this server
 * to turn "how do I play a G major chord" into "G" — the tool description asks
 * it to. Guessing on the server would mean the MCP server and the website
 * disagreeing about what a query means.
 */
export const findChord = (chords: Chord[], query: string): Chord | undefined => {
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;

  return (
    chords.find((c) => c.name.toLowerCase() === needle) ??
    chords.find((c) => c.name.toLowerCase().includes(needle))
  );
};
