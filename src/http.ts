import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { analyticsEnabled, capture, newCallerContext, shutdownAnalytics } from './analytics.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { loadChords } from './data.js';

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
// A chord name is a few dozen bytes. The old 1 MB ceiling only ever benefited
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
 * Pull whatever identifies the caller out of the request.
 *
 * Only `initialize` carries `clientInfo`, and in stateless mode that's a
 * different request from the tool calls that follow — so tool-call events
 * generally can't say which assistant made them. See README "Analytics".
 */
const contextFor = (req: express.Request) => {
  const context = newCallerContext(req.get('user-agent'));
  context.protocolVersion = req.get('mcp-protocol-version') ?? undefined;

  const body = req.body as { method?: string; params?: Record<string, unknown> } | undefined;
  const clientInfo = body?.params?.clientInfo as { name?: string; version?: string } | undefined;
  if (clientInfo) {
    context.clientName = clientInfo.name;
    context.clientVersion = clientInfo.version;
  }
  return context;
};

app.post('/mcp', async (req, res) => {
  const context = contextFor(req);
  const server = createServer(context);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    // Captured after the SDK has accepted the request, so a malformed
    // handshake that 406s or 415s doesn't inflate the session count.
    if ((req.body as { method?: string } | undefined)?.method === 'initialize') {
      capture(context, 'mcp_session_initialized');
    }
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
app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
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
});

const port = Number(process.env.PORT ?? 3030);
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
