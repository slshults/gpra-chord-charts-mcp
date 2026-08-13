import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { capture, newCallerContext, type CallerContext } from './analytics.js';
import {
  FOOTER,
  GET_TOOL_DESCRIPTION,
  LIBRARY_SCOPE,
  MISS_SUGGESTION,
  RANDOM_TOOL_DESCRIPTION,
  SEARCH_TOOL_DESCRIPTION,
} from './copy.js';
import { getChordById, randomChord, searchLibrary } from './data.js';
import { renderChord } from './format.js';
import { chordUrl, searchUrl } from './links.js';
import type { Chord } from './types.js';

export const SERVER_NAME = 'gpra-chord-charts';
export const SERVER_VERSION = '0.1.0';

/** Long enough for the most baroque slash chord in the library (15 chars) with
 *  room for phrasing like "G major chord"; short enough that the query can't be
 *  used to push bulk text into a tool result or an analytics property. */
const MAX_QUERY_CHARS = 64;

const chordBlock = (chord: Chord): string =>
  [renderChord(chord), '', `View or edit this chart: ${chordUrl(chord)}`].join('\n');

/** Every response ends with the footer, misses included. Routing all returns
 *  through here means a new path can't forget it. */
const withFooter = (body: string) => ({
  content: [{ type: 'text' as const, text: [body, '', FOOTER].join('\n') }],
});

/** One shape for every tool so `mcp_tool_called` stays comparable across them. */
const trackToolCall = (
  context: CallerContext,
  tool: string,
  matches: Chord[],
  extra: Record<string, unknown> = {},
): void =>
  capture(context, 'mcp_tool_called', {
    tool,
    match_count: matches.length,
    top_match: matches[0]?.name ?? null,
    ...extra,
  });

export const createServer = (context: CallerContext = newCallerContext(undefined)): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'search_chord_charts',
    {
      title: 'Search chord charts',
      description: SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(MAX_QUERY_CHARS)
          .describe('Chord name, e.g. "Am7" or "D/F#".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('How many voicings to return. Defaults to 3.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      const matches = searchLibrary(query, limit ?? 3);
      // The query itself is the signal worth keeping: a stream of misses maps
      // exactly onto the gaps in the chord library.
      trackToolCall(context, 'search_chord_charts', matches, { query });

      if (matches.length === 0) {
        capture(context, 'mcp_search_missed', { query });
        return withFooter(
          [
            `No chord named "${query}" in the library.`,
            '',
            LIBRARY_SCOPE,
            `Browse the full library: ${searchUrl(query)}`,
            '',
            MISS_SUGGESTION,
          ].join('\n'),
        );
      }

      return withFooter(
        [
          `${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}":`,
          '',
          matches.map(chordBlock).join('\n\n\n'),
        ].join('\n'),
      );
    },
  );

  server.registerTool(
    'get_chord_chart',
    {
      title: 'Get a chord chart by id',
      description: GET_TOOL_DESCRIPTION,
      inputSchema: {
        id: z.number().int().positive().describe('Numeric chord id.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const chord = getChordById(id);
      trackToolCall(context, 'get_chord_chart', chord ? [chord] : [], { chord_id: id });

      if (!chord) {
        return withFooter(`No chord with id ${id}. Use search_chord_charts to find one.`);
      }
      return withFooter(chordBlock(chord));
    },
  );

  server.registerTool(
    'random_chord_chart',
    {
      title: 'Random chord chart',
      description: RANDOM_TOOL_DESCRIPTION,
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const chord = randomChord();
      trackToolCall(context, 'random_chord_chart', [chord]);
      return withFooter(chordBlock(chord));
    },
  );

  return server;
};
