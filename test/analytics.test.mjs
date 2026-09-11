/**
 * The capture-time filter that keeps unknown-tool probes out of error tracking.
 * Outside verifiers name a tool that does not exist with a fresh random name
 * every day, so each `$exception` would otherwise open its own issue.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUnknownToolRejection } from '../dist/analytics.js';

const exceptionEvent = (value) => ({
  event: '$exception',
  properties: { $exception_list: [{ type: 'McpError', value }] },
});

test('drops the -32602 unknown-tool rejection', () => {
  assert.ok(
    isUnknownToolRejection(
      exceptionEvent('MCP error -32602: Tool __verifymcp_auth_probe_deadbeef__ not found'),
    ),
  );
  assert.ok(
    isUnknownToolRejection(exceptionEvent('MCP error -32602: Tool ddd__no_such_tool not found')),
  );
});

test('keeps every other exception', () => {
  // A different protocol code, and a real fault, must both still be captured.
  assert.ok(!isUnknownToolRejection(exceptionEvent('MCP error -32603: internal error')));
  assert.ok(!isUnknownToolRejection(exceptionEvent('TypeError: cannot read property of undefined')));
});

test('keeps non-exception events, including the tool call that recorded the miss', () => {
  assert.ok(
    !isUnknownToolRejection({
      event: '$mcp_tool_call',
      properties: { $mcp_error_message: 'MCP error -32602: Tool x not found' },
    }),
  );
});
