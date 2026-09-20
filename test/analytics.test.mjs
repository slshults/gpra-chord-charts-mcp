/**
 * The capture-time filter that keeps unknown-tool probes out of error tracking.
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
  assert.ok(isUnknownToolRejection(exceptionEvent('MCP error -32602: Tool no_such_tool not found')));
});

test('keeps every other exception', () => {
  assert.ok(!isUnknownToolRejection(exceptionEvent('MCP error -32603: internal error')));
  assert.ok(!isUnknownToolRejection(exceptionEvent('MCP error -32602: Tool x disabled')));
  assert.ok(!isUnknownToolRejection(exceptionEvent('TypeError: cannot read property of undefined')));
  assert.ok(!isUnknownToolRejection({ event: '$exception', properties: {} }));
});

test('keeps non-exception events, including the tool call that recorded the miss', () => {
  assert.ok(
    !isUnknownToolRejection({
      event: '$mcp_tool_call',
      properties: { $mcp_error_message: 'MCP error -32602: Tool x not found' },
    }),
  );
});
