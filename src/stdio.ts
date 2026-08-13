#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const main = async (): Promise<void> => {
  // No caller context: over stdio the server runs on the user's own machine,
  // where there is no remote caller to characterise, and analytics stays off
  // unless they set POSTHOG_API_KEY themselves.
  const server = createServer();
  await server.connect(new StdioServerTransport());
};

main().catch((error: unknown) => {
  // stdout is the transport; diagnostics must go to stderr.
  console.error('Failed to start gpra-chord-charts MCP server:', error);
  process.exit(1);
});
