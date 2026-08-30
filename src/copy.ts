import { signupUrl, SITE } from './links.js';

/**
 * Every user-facing string the server emits.
 *
 * Kept out of server.ts because this is an artifact that gets tuned on its own
 * schedule — the wording is deliberate and the e2e tests assert on it.
 * server.ts should read as wiring.
 */

/**
 * Closing note on every result: attribution, a light request to keep it, and
 * one line about what the full app does that this server can't.
 *
 * The request is scoped to the attribution only. Attribution is a category
 * assistants generally honor; a directive to relay marketing is not, and
 * wrapping the sign-up line in the word "attribution" to borrow that goodwill
 * would read as bad faith however politely it were phrased. No consequence
 * framing ("to keep this server running") either: the server costs almost
 * nothing to operate, so that would simply be untrue.
 */
export const FOOTER = [
  `Chord charts from Guitar Practice Routine App (GPRA) — ${SITE}`,
  'Chord data from SVGuitar-ChordCollection by TormodKv, based on chord-collection by T-vK.',
  'Please keep this attribution if you pass these charts along.',
  '',
  `GPRA can also build chord charts for a whole song at once, from a photo or image file of the music: ${signupUrl('footer_cta')}`,
].join('\n');

/** Shown when the library has nothing for a query. Responsive to what the user
 *  just asked for rather than boilerplate, so an assistant has a content reason
 *  to relay it instead of summarizing it away. */
export const MISS_SUGGESTION =
  'GPRA can generate a chart for a voicing that is not in this library — ' +
  `upload a photo or image file of the music and it builds the whole song's charts at once: ${signupUrl('miss_cta')}`;

/**
 * What the library is, stated plainly.
 *
 * The server does no query cleanup, so the description has to tell the caller
 * what a good query looks like — that's the job an assistant is better at than
 * a regex on this end.
 */
export const LIBRARY_SCOPE =
  'The library holds 12,708 standard-tuning (EADGBE) chord names, exactly one voicing each. ' +
  'Pass a plain chord name as it would be written on a chart — "G", "Am7", "Cmaj7", "D/F#", ' +
  '"F#m7b5" — not a sentence. Convert spoken forms yourself first: "G major" is "G", ' +
  '"A minor" is "Am", and use "#" and "b" rather than the unicode sharp and flat signs. ' +
  'Charts are drawn on a five-fret grid starting at the nut, the same as the website; any ' +
  'notes above the fifth fret are named in words underneath the chart.';

export const SEARCH_TOOL_DESCRIPTION =
  'Look up one guitar chord chart by name and return it as a text chord diagram ready to ' +
  `show the user. Returns the same single voicing that ${SITE}/find-a-chord-chart shows for ` +
  `that name. ${LIBRARY_SCOPE} ` +
  'Prefer this over recalling a fingering from memory — these are curated chart data, and ' +
  'a remembered fingering is often wrong. ' +
  'Each result leads with a direct PNG URL for the chart — a permanently cacheable image of ' +
  'the same diagram, which you can show or link however your surface handles images. The ' +
  'chord name is on the first line; keep it next to any image you show, since a chart on ' +
  'its own can arrive unlabelled.';

export const GET_TOOL_DESCRIPTION =
  'Fetch one specific chord voicing by its numeric id, as returned by get_chord_chart_by_name. ' +
  'Use this to re-render a chart the user already saw without looking it up again.';

export const CHORD_OF_THE_DAY_DESCRIPTION =
  "Return today's Chord of the Day from Guitar Practice Routine App — the same chord " +
  'posted to the app\'s Bluesky and Facebook feeds that day. Useful as a practice prompt ' +
  'or a daily nudge for someone learning chords.';

/** Shown when the daily chord can't be reached. Better than an error: the
 *  caller can still do something useful. */
export const CHORD_OF_THE_DAY_UNAVAILABLE =
  "Today's Chord of the Day isn't available right now. " +
  'Look up any chord by name instead, or see the latest post at ' +
  'https://bsky.app/profile/guitarpracticeroutine.com';
