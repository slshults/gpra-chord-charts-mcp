import type { Chord } from './types.js';

export const SITE = 'https://guitarpracticeroutine.com';

/** Short domain, redirects to SITE. Used for the call to action so the line
 *  stays readable when an assistant renders it inline. */
export const SHORT_SITE = 'https://gpra.app';

/**
 * Deep link to the public chord-chart page for one voicing.
 *
 * UTM tags follow the same convention as the site's other outbound links, so
 * analytics can attribute traffic that arrives via an AI assistant.
 */
export const chordUrl = (chord: Chord): string => {
  const params = new URLSearchParams({
    id: String(chord.id),
    utm_source: 'mcp',
    utm_medium: 'ai_assistant',
    utm_campaign: 'chord_chart_mcp',
    utm_content: chord.name,
  });
  return `${SITE}/find-a-chord-chart?${params.toString()}`;
};

/**
 * Landing page for a call to action, tagged so PostHog can tell MCP-sourced
 * signups apart from the per-chart deep links.
 *
 * `content` separates the two CTAs: the generic footer, and the line shown when
 * the library has no match. They're worded differently on the theory that the
 * responsive one lands better, and sharing one tag would make that untestable.
 */
export const signupUrl = (content: 'footer_cta' | 'miss_cta' = 'footer_cta'): string => {
  const params = new URLSearchParams({
    utm_source: 'mcp',
    utm_medium: 'ai_assistant',
    utm_campaign: 'chord_chart_mcp',
    utm_content: content,
  });
  return `${SHORT_SITE}/?${params.toString()}`;
};

export const searchUrl = (query: string): string => {
  const params = new URLSearchParams({
    chord: query,
    utm_source: 'mcp',
    utm_medium: 'ai_assistant',
    utm_campaign: 'chord_chart_mcp',
  });
  return `${SITE}/find-a-chord-chart?${params.toString()}`;
};
