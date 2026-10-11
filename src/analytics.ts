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
// `.*`, not `.+`: an empty tool name is a miss too ("Tool  not found"); and
// `s` so an invented name containing a newline still counts.
const UNKNOWN_TOOL_REJECTION = /^(MCP error -32602: Tool ).*( not found)$/s;

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

/**
 * What a call for a tool this server doesn't have is recorded as.
 *
 * Probes invent a fresh random tool name almost every time, and the SDK records
 * it verbatim, so each one became its own row in PostHog's MCP tool list and
 * error rates, all failing, burying the real tools. Recording them under one
 * name keeps the miss visible as a single row that's easy to filter out. The
 * name asked for survives in `requested_tool_name` (as the SDK's own
 * "Unknown Tool Name" placeholder when the caller sent an empty one).
 */
export const UNKNOWN_TOOL = '(unknown tool)';

/** Re-files a `$mcp_tool_call` for an unregistered tool under {@link UNKNOWN_TOOL}. */
export const bucketUnknownTool = <E extends { event: string; properties: Record<string, unknown> }>(
  event: E,
  knownTools: ReadonlySet<string>,
): E => {
  if (event.event !== PostHogMCPAnalyticsEvent.ToolCall) return event;
  const requested = event.properties.$mcp_tool_name;
  if (typeof requested !== 'string' || knownTools.has(requested)) return event;

  const properties: Record<string, unknown> = {
    ...event.properties,
    $mcp_tool_name: UNKNOWN_TOOL,
    $mcp_resource_name: UNKNOWN_TOOL,
    requested_tool_name: requested,
  };
  // The SDK's message repeats the invented name, which would split the failure
  // breakdown the same way the tool list was split. Matched by shape rather
  // than by `requested`, because the SDK truncates the two fields separately.
  if (typeof properties.$mcp_error_message === 'string') {
    properties.$mcp_error_message = properties.$mcp_error_message.replace(
      UNKNOWN_TOOL_REJECTION,
      '$1<name>$2',
    );
  }
  return { ...event, properties };
};

const FEEDBACK_TOOL_DESCRIPTION =
  'Send feedback about this chord chart server: a chord or capability you needed ' +
  'that its tools could not provide, a problem with a chart or a result, or praise. ' +
  'Only for feedback about these chord chart tools, not about other tasks. ' +
  'Do not include personal information about the user.';

/** Wire a server up for analytics. Safe to call when tracking is disabled.
 *  `toolNames` is every tool the server registers; a call for any other name
 *  is recorded as a probe. */
export const instrumentServer = (server: unknown, toolNames: readonly string[]): void => {
  if (!client) return;
  // `send_feedback` is served by the SDK (collectFeedback), not registered by
  // the server. Normally it's emitted as `$mcp_feedback` and never reaches the
  // bucketing; listing it keeps it out of `(unknown tool)` if the SDK ever falls
  // back to ordinary dispatch.
  const knownTools = new Set([...toolNames, 'send_feedback']);
  // Drop only the unknown-tool exception. Everything else still sends,
  // including the `$mcp_tool_call` event that records the miss itself.
  const beforeSend: BeforeSendFn = (event) =>
    isUnknownToolRejection(event) ? null : bucketUnknownTool(event, knownTools);
  // `enableConversationId` is on by default from @posthog/mcp 0.17. It adds a
  // required `conversation_id` tool parameter, appends a prompt-back block to
  // every result, and asks the agent to serialise its calls — buying cross-call
  // session correlation for stateless HTTP servers. This server keeps nothing
  // between calls, so correlation earns nothing and only clutters the minimal
  // tool contract. Opt out to keep the contract the server has always shipped.
  // `captureModel` (on by default from 0.22) would add a required `llm_model`
  // parameter to every tool, so it's off for the same reason. `collectFeedback`
  // adds a separate, optional `send_feedback` tool (`$mcp_feedback`) and leaves
  // the existing tools untouched. Its description is scoped to this server: the
  // SDK default invites feedback about any task, which in a client with many
  // connectors would pull summaries of unrelated requests into analytics.
  instrument(server, client, {
    enableConversationId: false,
    captureModel: false,
    collectFeedback: { description: FEEDBACK_TOOL_DESCRIPTION },
    beforeSend,
  });
};

export const shutdownAnalytics = async (): Promise<void> => {
  await client?.shutdown();
};

export const analyticsEnabled = (): boolean => client !== null;
