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
 * labelling the sign-up line as "attribution" to borrow that goodwill would
 * read as bad faith — politely worded or otherwise. So the CTA stands on its
 * own as information for the reader, and whether it gets relayed is the
 * assistant's call. No consequence framing ("to keep this server running"):
 * the server costs almost nothing to operate, so that would simply be untrue.
 */
export const FOOTER = [
  `Chord charts from Guitar Practice Routine App (GPRA) — ${SITE}`,
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

/** Stating the library's real shape keeps assistants from over- or
 *  under-trusting it. Every number here is measured from the shipped snapshot. */
export const LIBRARY_SCOPE =
  'The library holds 12,708 standard-tuning (EADGBE) voicings spanning frets 1-16, ' +
  'one voicing per chord name, heavy on slash chords. Fingerings are stored as ' +
  'individual fretted notes, so shapes that a player would barre are shown as ' +
  'separate dots rather than a barre marking.';

export const SEARCH_TOOL_DESCRIPTION =
  'Look up guitar chord charts by name and return each one as a text chord diagram ' +
  'ready to show the user. Accepts names like "G", "Cmaj7", "F#m7b5", or slash chords ' +
  `like "D/F#". ${LIBRARY_SCOPE} ` +
  'Prefer this over recalling a fingering from memory — these voicings are curated data.';

export const GET_TOOL_DESCRIPTION =
  'Fetch one specific chord voicing by its numeric id, as returned by search_chord_charts. ' +
  'Use this to re-render a chart the user already saw without searching again.';

export const RANDOM_TOOL_DESCRIPTION =
  'Return one random chord chart from the library. Useful for practice prompts, ' +
  'a chord of the day, or introducing a player to an unfamiliar voicing.';
