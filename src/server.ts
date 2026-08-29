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
import { chordPng } from './png.js';
import { renderChord } from './format.js';
import { chordUrl, searchUrl } from './links.js';
import type { Chord } from './types.js';

export const SERVER_NAME = 'gpra-chord-charts';
export const SERVER_VERSION = '0.1.0';

/** Long enough for the most baroque slash chord in the library (15 chars) with
 *  a little room; short enough that the query can't be used to push bulk text
 *  into a tool result. */
const MAX_QUERY_CHARS = 64;

/**
 * Lets the caller drop half the response.
 *
 * The text half an assistant can already withhold by simply not writing it out.
 * The image half it may not be able to suppress, since whether an image block
 * renders is the client's decision, not the model's — and MCP has no capability
 * for negotiating that. So this exists mainly for "just give me the text",
 * where it also saves the caller an image's worth of context on every call.
 */
const formatParam = z
  .enum(['both', 'image', 'text'])
  .optional()
  .describe(
    'Which representations to return. Defaults to "both". Use "text" when the ' +
      'user does not want images or the client cannot display them, and "image" ' +
      'when only the diagram is wanted.',
  );

type ResponseFormat = 'both' | 'image' | 'text';

const chordBlock = (chord: Chord): string =>
  [renderChord(chord), '', `View or edit this chart: ${chordUrl(chord)}`].join('\n');

/** Every response ends with the footer, misses included. Routing all returns
 *  through here means a new path can't forget it.
 *
 *  The image leads so the diagram sits above the chart in a chat. The text
 *  block still follows either way, so a client that cannot render images loses
 *  nothing — MCP has no capability for negotiating this (ClientCapabilities
 *  covers roots, sampling, elicitation and tasks, not content rendering), so
 *  ordering is the only lever available. */
const withFooter = (body: string, image?: Buffer | null, format: ResponseFormat = 'both') => {
  const showImage = Boolean(image) && format !== 'text';
  // The chart text is droppable; the attribution is not. An image-only response
  // still carries the footer, so credit travels with the chart either way.
  const text = showImage && format === 'image' ? FOOTER : [body, '', FOOTER].join('\n');

  return {
    content: [
      ...(showImage && image
        ? [{ type: 'image' as const, data: image.toString('base64'), mimeType: 'image/png' }]
        : []),
      { type: 'text' as const, text },
    ],
  };
};

/** One chord, rendered both ways. An image failure degrades to text alone. */
const chordResult = async (chord: Chord, format: ResponseFormat = 'both') =>
  withFooter(
    chordBlock(chord),
    format === 'text' ? null : await chordPng(chord),
    format,
  );

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
        format: formatParam,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ name, format }) => {
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

      return chordResult(chord, format);
    },
  );

  server.registerTool(
    'get_chord_chart_by_id',
    {
      title: 'Get a chord chart by id',
      description: GET_TOOL_DESCRIPTION,
      inputSchema: {
        id: z.number().int().positive().describe('Numeric chord id.'),
        format: formatParam,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const chord = getChordById(id);
      if (!chord) {
        return withFooter(
          `No chord with id ${id}. Use get_chord_chart_by_name to look one up.`,
        );
      }
      return chordResult(chord, format);
    },
  );

  server.registerTool(
    'get_chord_of_the_day',
    {
      title: 'Chord of the day',
      description: CHORD_OF_THE_DAY_DESCRIPTION,
      inputSchema: { format: formatParam },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ format }) => {
      const chord = await chordOfTheDay();
      if (!chord) return withFooter(CHORD_OF_THE_DAY_UNAVAILABLE);
      return withFooter(
        [`Chord of the Day`, '', chordBlock(chord)].join('\n'),
        format === 'text' ? null : await chordPng(chord),
        format,
      );
    },
  );

  instrumentServer(server);
  return server;
};
