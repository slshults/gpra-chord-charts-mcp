import { randomUUID } from 'node:crypto';
import { PostHog } from 'posthog-node';

/**
 * Usage tracking.
 *
 * No-ops unless POSTHOG_API_KEY is set, so local development and stdio installs
 * stay silent — the same gating pattern the main app uses for its OTLP logs.
 *
 * There is no user here and no browser, so nothing is fingerprinted. What's
 * worth knowing is *what kind of caller* it is and *what they asked for*, both
 * of which come from the request itself.
 */

const API_KEY = process.env.POSTHOG_API_KEY;
const HOST = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

/** Caller-supplied strings are cut to this before they reach PostHog. A
 *  megabyte-long query is a valid request but has no business becoming an
 *  event property. */
const MAX_PROPERTY_CHARS = 200;

const client = API_KEY ? new PostHog(API_KEY, { host: HOST, flushAt: 1, flushInterval: 5000 }) : null;

export interface CallerContext {
  distinctId: string;
  userAgent: string;
  /** From the MCP `initialize` handshake, when the request carries one. */
  clientName?: string;
  clientVersion?: string;
  protocolVersion?: string;
}

const truncate = (value: string | undefined): string | null => {
  if (!value) return null;
  return value.length > MAX_PROPERTY_CHARS ? `${value.slice(0, MAX_PROPERTY_CHARS)}…` : value;
};

/**
 * Buckets a caller so the useful question — humans-via-an-assistant vs indexers
 * vs scrapers vs scanners — is answerable without reading raw user agents.
 *
 * Order matters. Vendor crawlers are matched before vendor names, because
 * `ClaudeBot` and `GPTBot` are indexing robots, not someone asking for a chord,
 * and letting them fall into `claude`/`openai` would pollute the two buckets
 * most worth keeping clean.
 */
export const classifyCaller = (context: CallerContext): string => {
  const haystack = `${context.clientName ?? ''} ${context.userAgent}`.toLowerCase();

  if (/claudebot|claude-searchbot|gptbot|oai-searchbot|perplexitybot|ccbot|bytespider/.test(haystack)) {
    return 'crawler';
  }
  // Claude-User is a user-driven fetch, so it belongs with claude, not crawler.
  if (/claude|anthropic/.test(haystack)) return 'claude';
  if (/chatgpt|openai/.test(haystack)) return 'openai';
  if (/cursor|windsurf|\bcline\b|\bcontinue\b|\bzed\b|copilot|gemini|goose|librechat|openwebui|vscode|\bn8n\b|dify/.test(haystack)) {
    return 'coding_harness';
  }
  if (/inspector|mcpjam|postman|insomnia|mcp-remote/.test(haystack)) return 'developer_tool';
  if (/glama|smithery|pulsemcp|mcp\.so|registry|directory/.test(haystack)) return 'registry';
  if (/sentineloracle|glimind|bot|crawler|spider|scan|nuclei|zgrab|censys|l9explore|expanse|masscan/.test(haystack)) {
    return 'scanner';
  }
  if (/curl|wget|python-requests|httpx|okhttp|\bjava\b|go-http-client|node-fetch|axios/.test(haystack)) {
    return 'script';
  }
  return 'unknown';
};

export const newCallerContext = (userAgent: string | undefined): CallerContext => ({
  distinctId: randomUUID(),
  userAgent: userAgent ?? '',
});

const baseProperties = (context: CallerContext): Record<string, unknown> => ({
  // Without this every request would mint a person profile in the GPRA
  // project — one prober alone would add hundreds of phantom people a day.
  // The distinct id still correlates the events within a single request.
  $process_person_profile: false,
  caller_kind: classifyCaller(context),
  client_name: truncate(context.clientName),
  client_version: truncate(context.clientVersion),
  mcp_protocol_version: truncate(context.protocolVersion),
  user_agent: truncate(context.userAgent),
  surface: 'mcp',
});

export const capture = (
  context: CallerContext,
  event: string,
  properties: Record<string, unknown> = {},
): void => {
  if (!client) return;
  const safe = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      typeof value === 'string' ? truncate(value) : value,
    ]),
  );
  client.capture({
    distinctId: context.distinctId,
    event,
    properties: { ...baseProperties(context), ...safe },
  });
};

export const shutdownAnalytics = async (): Promise<void> => {
  await client?.shutdown();
};

export const analyticsEnabled = (): boolean => client !== null;
