import { instrument, PostHog, PostHogMCPAnalyticsEvent, type BeforeSendFn } from '@posthog/mcp';

/**
 * Usage tracking.
 *
 * This is PostHog's own MCP SDK rather than anything hand-rolled — the same
 * approach the Shakespeare Monologues MCP server uses. One `instrument()` call
 * auto-captures `$mcp_initialize`, `$mcp_tools_list`, `$mcp_tool_call` and
 * exceptions, with tool name, duration, error state, the calling client's
 * name and version, and the agent's stated intent (from each tool's `context`
 * argument). It also classifies traffic — `$virt_traffic_type`,
 * `$virt_bot_name` — using operator-published bot IP ranges, which is why
 * there is no user-agent classifier of our own to get wrong.
 *
 * These are the canonical `$mcp_*` events, so PostHog's built-in MCP analytics
 * (harness breakdown, tool stats, sample intents) work without extra wiring.
 *
 * No-ops unless POSTHOG_API_KEY is set, so local development and stdio installs
 * send nothing.
 */

const API_KEY = process.env.POSTHOG_API_KEY;
const HOST = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

const client = API_KEY ? new PostHog(API_KEY, { host: HOST }) : null;

/**
 * The MCP SDK answers a call for a tool this server does not have with exactly
 * `MCP error -32602: Tool <name> not found`. That is the correct protocol reply,
 * not a fault, but `instrument()` still captures it as a `$exception` — and
 * outside verifiers probe the public server with a fresh random tool name most
 * days, so each miss opened its own error tracking issue.
 */
const UNKNOWN_TOOL_REJECTION = /^MCP error -32602: Tool .+ not found$/;

/** True for the `$exception` PostHog emits when a caller names a tool that does not exist. */
export const isUnknownToolRejection = (event: {
  event: string;
  properties: Record<string, unknown>;
}): boolean => {
  if (event.event !== PostHogMCPAnalyticsEvent.Exception) return false;
  const list = event.properties.$exception_list;
  if (!Array.isArray(list)) return false;
  return list.some(
    (entry) => typeof entry?.value === 'string' && UNKNOWN_TOOL_REJECTION.test(entry.value),
  );
};

// Drop only that exception. Everything else still sends, including the
// `$mcp_tool_call` event that records the miss itself.
const beforeSend: BeforeSendFn = (event) => (isUnknownToolRejection(event) ? null : event);

/** Wire a server up for analytics. Safe to call when tracking is disabled. */
export const instrumentServer = (server: unknown): void => {
  if (!client) return;
  // `enableConversationId` is on by default from @posthog/mcp 0.17. It adds a
  // required `conversation_id` tool parameter, appends a prompt-back block to
  // every result, and asks the agent to serialise its calls — buying cross-call
  // session correlation for stateless HTTP servers. This server keeps nothing
  // between calls, so correlation earns nothing and only clutters the minimal
  // tool contract. Opt out to keep the contract the server has always shipped.
  instrument(server, client, { enableConversationId: false, beforeSend });
};

export const shutdownAnalytics = async (): Promise<void> => {
  await client?.shutdown();
};

export const analyticsEnabled = (): boolean => client !== null;
