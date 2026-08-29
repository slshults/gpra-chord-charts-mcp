import type { Chord } from './types.js';

export const SITE = 'https://guitarpracticeroutine.com';

/** Short domain, redirects to SITE. Used for the call to action so the line
 *  stays readable when an assistant renders it inline. */
export const SHORT_SITE = 'https://gpra.app';

/**
 * Where this server answers from, for building chart image URLs.
 *
 * Always points at the hosted instance, even for stdio callers — a URL is only
 * useful if it resolves for whoever the answer is passed on to.
 */
const PUBLIC_BASE =
  process.env.MCP_PUBLIC_BASE_URL ?? 'https://mcp.guitarpracticeroutine.com';

/**
 * A stable, directly-fetchable PNG of one voicing.
 *
 * Pixels inside a tool result are useful to exactly one renderer, and only if
 * that client happens to surface them. A URL works everywhere else the answer
 * might end up: an artifact, an HTML page, a markdown image, a saved file, an
 * API consumer. Cheap to add, and it is the part of the payload that survives
 * being copied out of the conversation.
 */
export const chartImageUrl = (chord: Chord): string => `${PUBLIC_BASE}/chart/${chord.id}.png`;

/**
 * UTM tags on outbound links.
 *
 * No `utm_campaign` — this isn't advertising, and a campaign name would just be
 * noise in web analytics. `utm_medium` stays generic because the calling
 * assistant isn't identifiable at tool-call time on a stateless transport; the
 * `$mcp_*` events PostHog's MCP SDK emits carry the client name and version
 * properly, so the link doesn't need to.
 */
const tags = (content: string): Record<string, string> => ({
  utm_source: 'mcp',
  utm_medium: 'ai_assistant',
  utm_content: content,
});

/** Deep link to the public chord-chart page for one voicing. */
export const chordUrl = (chord: Chord): string => {
  const params = new URLSearchParams({ id: String(chord.id), ...tags(chord.name) });
  return `${SITE}/find-a-chord-chart?${params.toString()}`;
};

/**
 * Landing page for a call to action.
 *
 * `content` separates the two CTAs: the generic footer, and the line shown when
 * the library has no match. They're worded differently on the theory that the
 * responsive one lands better, and sharing one tag would make that untestable.
 */
export const signupUrl = (content: 'footer_cta' | 'miss_cta' = 'footer_cta'): string =>
  `${SHORT_SITE}/?${new URLSearchParams(tags(content)).toString()}`;

export const searchUrl = (query: string): string => {
  const params = new URLSearchParams({ chord: query, ...tags('no_match') });
  return `${SITE}/find-a-chord-chart?${params.toString()}`;
};
