import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { analyticsEnabled, shutdownAnalytics } from './analytics.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { getChordById, loadChords } from './data.js';
import { chordPng } from './png.js';

/**
 * Stateless streamable-HTTP endpoint: a fresh server + transport per request,
 * no session state. The whole surface is read-only lookups against a bundled
 * snapshot, so there is nothing to keep between calls, and statelessness means
 * the process can be restarted or scaled without dropping anyone's session.
 *
 * No CORS headers are set. Claude and the connector directory fetch server-side,
 * so they don't need them; a browser-based MCP client would.
 */
const app = express();
app.disable('x-powered-by');
// A chord name is a few dozen bytes. A larger ceiling only ever benefits
// someone trying to make the parser do work.
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: SERVER_NAME,
    version: SERVER_VERSION,
    chords: loadChords().length,
    analytics: analyticsEnabled(),
  });
});

/**
 * A chord chart as a plain image, fetchable by anything.
 *
 * Images embedded in a tool result only reach people if the client chooses to
 * surface them; a URL reaches every other surface the answer travels to —
 * artifacts, HTML, markdown, a saved file. Charts are deterministic per id, so
 * the response is immutable and cacheable forever.
 */
app.get('/chart/:file', async (req, res) => {
  const match = /^(\d+)\.png$/.exec(req.params.file);
  if (!match) {
    res.status(404).json({ error: 'Expected /chart/<id>.png' });
    return;
  }

  const chord = getChordById(Number(match[1]));
  if (!chord) {
    res.status(404).json({ error: 'Chord not found' });
    return;
  }

  const png = await chordPng(chord);
  if (!png) {
    res.status(500).json({ error: 'Failed to render chord chart' });
    return;
  }

  res
    .type('image/png')
    // A plain <img> load needs no CORS, but a client that fetches the bytes or
    // sets crossorigin does. It's a public read-only image; nothing to protect.
    .set('Access-Control-Allow-Origin', '*')
    .set('Cache-Control', 'public, max-age=31536000, immutable')
    .set('Content-Disposition', `inline; filename="${chord.name.replace(/[^\w#-]/g, '_')}.png"`)
    .send(png);
});

app.post('/mcp', async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Stateless mode has no server-initiated streams and nothing to terminate.
const methodNotAllowed = (_req: express.Request, res: express.Response): void => {
  res.set('Allow', 'POST').status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
};
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

/**
 * Terminal error handler. Body-parser rejections (malformed JSON, oversized
 * payload) otherwise fall through to Express's default, which renders a stack
 * trace with absolute filesystem paths whenever NODE_ENV isn't "production" —
 * one missing environment line away from leaking internals on every bad
 * request. This makes the response shape independent of that setting.
 */
app.use(
  (
    error: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 400;
    res.status(status).json({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error.' },
      id: null,
    });
  },
);

// 2112. Rush, and a Canadian one at that.
const port = Number(process.env.PORT ?? 2112);
// Loopback only: nginx terminates TLS and is the sole thing that should reach
// this process. Binding 0.0.0.0 would expose it directly on the host's IP.
const host = process.env.HOST ?? '127.0.0.1';
const listener = app.listen(port, host, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} listening on ${host}:${port} (POST /mcp)`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  // `listener.close()` waits for every *active* connection to end, and a
  // scanner holding a half-open socket never ends one — so without
  // closeAllConnections() the process hangs until systemd SIGKILLs it and the
  // queued analytics events die with it. The timer is a belt-and-braces
  // backstop; unref'd so it can't itself keep the process alive.
  const force = setTimeout(() => process.exit(0), 3000);
  force.unref();

  listener.close(() => {
    void shutdownAnalytics().finally(() => process.exit(0));
  });
  listener.closeAllConnections();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
