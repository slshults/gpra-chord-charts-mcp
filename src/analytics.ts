import { instrument, PostHog } from '@posthog/mcp';

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

/** Wire a server up for analytics. Safe to call when tracking is disabled. */
export const instrumentServer = (server: unknown): void => {
  if (!client) return;
  // `enableConversationId` is on by default from @posthog/mcp 0.17. It adds a
  // required `conversation_id` tool parameter, appends a prompt-back block to
  // every result, and asks the agent to serialise its calls — buying cross-call
  // session correlation for stateless HTTP servers. This server keeps nothing
  // between calls, so correlation earns nothing and only clutters the minimal
  // tool contract. Opt out to keep the contract the server has always shipped.
  instrument(server, client, { enableConversationId: false });
};

export const shutdownAnalytics = async (): Promise<void> => {
  await client?.shutdown();
};

export const analyticsEnabled = (): boolean => client !== null;
