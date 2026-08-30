import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getChordById } from './data.js';
import { chartImageUrl, SITE } from './links.js';
import type { Chord } from './types.js';

/**
 * MCP Apps widget — an inline chord chart for hosts that render one.
 *
 * Where this actually renders, as of 2026-08: Claude Code, Cowork, ChatGPT and
 * PostHog Desktop. It does NOT render on claude.ai or Claude Desktop chat for a
 * custom remote connector — the host negotiates the capability and fetches the
 * resource, then never mounts the iframe (modelcontextprotocol/ext-apps#671).
 * That's a host-side gap, not something a server can fix, so this is built as
 * one layer of a fallback stack rather than as the answer: widget where it
 * renders, PNG bytes on request, and the chart URL in the text everywhere.
 *
 * The chord is baked into the HTML server-side and addressed by a per-call
 * resource URI, so the widget carries no JavaScript at all — no postMessage
 * bridge, no client bundle to serve, no CSP beyond loading our own image. The
 * cost is that a host which ignores a per-call `resourceUri` shows no widget;
 * the text answer is unaffected, which is the right way for this to fail.
 */

const URI_PREFIX = 'ui://gpra-chord-charts/chart';

export const widgetUriFor = (chord: Chord): string => `${URI_PREFIX}/${chord.id}`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/**
 * The widget itself. Deliberately plain: one image, one caption, one credit.
 *
 * Colours follow the host's theme via `prefers-color-scheme` rather than being
 * fixed, because unlike the PNG — which is baked black-on-white for an unknown
 * backdrop — an iframe can actually see what it has been dropped into.
 */
const widgetHtml = (chord: Chord): string => {
  const name = escapeHtml(chord.name);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} chord chart</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 12px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: transparent;
    color: #1a1a1a;
  }
  h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: 0.01em; }
  img {
    width: 100%;
    max-width: 260px;
    height: auto;
    border-radius: 8px;
    background: #fff;
  }
  a { color: inherit; opacity: 0.65; font-size: 12px; text-decoration: none; }
  a:hover { opacity: 1; text-decoration: underline; }
  @media (prefers-color-scheme: dark) { body { color: #ededed; } }
</style>
</head>
<body>
  <h1>${name}</h1>
  <img src="${chartImageUrl(chord)}" alt="${name} chord chart" width="260">
  <a href="${SITE}/find-a-chord-chart?id=${chord.id}" target="_blank" rel="noopener">Guitar Practice Routine App</a>
</body>
</html>`;
};

/**
 * Registers the widget as a templated resource, so each chord gets its own URI
 * and the host fetches HTML with that chord already in it.
 */
export const registerChordWidget = (server: McpServer): void => {
  server.registerResource(
    'chord-chart-widget',
    new ResourceTemplate(`${URI_PREFIX}/{id}`, { list: undefined }),
    {
      title: 'Chord chart',
      description: 'An inline chord chart for one voicing.',
      mimeType: RESOURCE_MIME_TYPE,
    },
    (uri) => {
      const id = Number(uri.href.slice(`${URI_PREFIX}/`.length));
      const chord = Number.isFinite(id) ? getChordById(id) : undefined;
      if (!chord) {
        throw new Error(`No chord chart widget for ${uri.href}`);
      }
      return {
        contents: [
          { uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml(chord) },
        ],
      };
    },
  );
};
