import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { instrumentServer } from './analytics.js';
import { chordOfTheDay } from './chord-of-the-day.js';
import {
  CHORD_OF_THE_DAY_DESCRIPTION,
  CHORD_OF_THE_DAY_UNAVAILABLE,
  FOOTER,
  GET_TOOL_DESCRIPTION,
  LIBRARY_SCOPE,
  MISS_SUGGESTION,
  SEARCH_TOOL_DESCRIPTION,
} from './copy.js';
import { getChordById, lookupChord } from './data.js';
import { renderChord } from './format.js';
import { chordUrl, searchUrl } from './links.js';
import type { Chord } from './types.js';

export const SERVER_NAME = 'gpra-chord-charts';
export const SERVER_VERSION = '0.1.0';

/** Long enough for the most baroque slash chord in the library (15 chars) with
 *  a little room; short enough that the query can't be used to push bulk text
 *  into a tool result. */
const MAX_QUERY_CHARS = 64;

const chordBlock = (chord: Chord): string =>
  [renderChord(chord), '', `View or edit this chart: ${chordUrl(chord)}`].join('\n');

/** Every response ends with the footer, misses included. Routing all returns
 *  through here means a new path can't forget it. */
const withFooter = (body: string) => ({
  content: [{ type: 'text' as const, text: [body, '', FOOTER].join('\n') }],
});

export const createServer = (): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'get_chord_chart_by_name',
    {
      title: 'Get a chord chart by name',
      description: SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(MAX_QUERY_CHARS)
          .describe('A single chord name as written on a chart, e.g. "Am7" or "D/F#".'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ name }) => {
      const chord = lookupChord(name);

      if (!chord) {
        return withFooter(
          [
            `No chord named "${name}" in the library.`,
            '',
            LIBRARY_SCOPE,
            `Browse the full library: ${searchUrl(name)}`,
            '',
            MISS_SUGGESTION,
          ].join('\n'),
        );
      }

      return withFooter(chordBlock(chord));
    },
  );

  server.registerTool(
    'get_chord_chart_by_id',
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
      if (!chord) {
        return withFooter(
          `No chord with id ${id}. Use get_chord_chart_by_name to look one up.`,
        );
      }
      return withFooter(chordBlock(chord));
    },
  );

  server.registerTool(
    'get_chord_of_the_day',
    {
      title: 'Chord of the day',
      description: CHORD_OF_THE_DAY_DESCRIPTION,
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const chord = await chordOfTheDay();
      if (!chord) return withFooter(CHORD_OF_THE_DAY_UNAVAILABLE);
      return withFooter([`Chord of the Day`, '', chordBlock(chord)].join('\n'));
    },
  );

  instrumentServer(server);
  return server;
};
