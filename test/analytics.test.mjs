/**
 * The capture-time filters that keep unknown-tool probes out of error tracking
 * and out of the per-tool analytics.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketUnknownTool, isUnknownToolRejection, UNKNOWN_TOOL } from '../dist/analytics.js';

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
  assert.ok(isUnknownToolRejection(exceptionEvent('MCP error -32602: Tool  not found')));
  assert.ok(isUnknownToolRejection(exceptionEvent('MCP error -32602: Tool a\nb not found')));
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

const KNOWN = new Set(['get_chord_chart_by_name']);

const toolCall = (name, extra = {}) => ({
  event: '$mcp_tool_call',
  distinct_id: 'ses_1',
  properties: { $mcp_tool_name: name, $mcp_resource_name: name, ...extra },
});

test('files a call for an unregistered tool under one name', () => {
  const probe = '__verifymcp_auth_probe_deadbeef__';
  const out = bucketUnknownTool(
    toolCall(probe, {
      $mcp_is_error: true,
      $mcp_error_message: `MCP error -32602: Tool ${probe} not found`,
    }),
    KNOWN,
  );
  assert.equal(out.properties.$mcp_tool_name, UNKNOWN_TOOL);
  assert.equal(out.properties.$mcp_resource_name, UNKNOWN_TOOL);
  assert.equal(out.properties.requested_tool_name, probe);
  assert.equal(out.properties.$mcp_error_message, 'MCP error -32602: Tool <name> not found');
  assert.equal(out.properties.$mcp_is_error, true);
  assert.equal(out.distinct_id, 'ses_1');
});

test('scrubs the name from the message even when the SDK truncated the name field', () => {
  const longName = 'p'.repeat(300);
  const out = bucketUnknownTool(
    toolCall(`${'p'.repeat(256)}...`, {
      $mcp_error_message: `MCP error -32602: Tool ${longName} not found`,
    }),
    KNOWN,
  );
  assert.equal(out.properties.$mcp_error_message, 'MCP error -32602: Tool <name> not found');
});

test('leaves registered tools and other events alone', () => {
  const real = toolCall('get_chord_chart_by_name');
  assert.equal(bucketUnknownTool(real, KNOWN), real);

  const list = { event: '$mcp_tools_list', properties: { $mcp_tool_name: 'nope' } };
  assert.equal(bucketUnknownTool(list, KNOWN), list);
});
