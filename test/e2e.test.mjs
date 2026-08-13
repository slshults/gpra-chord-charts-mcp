/**
 * Drives the built server over a real stdio MCP session — handshake, tool
 * listing, tool calls — so a green run means an actual client can use it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = fileURLToPath(new URL('../dist/stdio.js', import.meta.url));

const withClient = async (fn) => {
  const client = new Client({ name: 'test-harness', version: '0.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
};

const textOf = (result) =>
  result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

test('server advertises its tools', async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['get_chord_chart', 'random_chord_chart', 'search_chord_charts']);
    for (const tool of tools) {
      assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a description`);
    }
  });
});

test('search returns a rendered chart and a deep link', async () => {
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({ name: 'search_chord_charts', arguments: { query: 'Am', limit: 1 } }),
    );
    assert.ok(text.includes('x 0 2 2 1 0'), 'compact grid present');
    assert.ok(text.includes('E  A  D  G  B  E'), 'chart header present');
    assert.ok(text.includes('guitarpracticeroutine.com/find-a-chord-chart?id='), 'deep link present');
    assert.ok(text.includes('utm_source=mcp'), 'attribution params present');
  });
});

test('search reports a clean miss instead of guessing', async () => {
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({ name: 'search_chord_charts', arguments: { query: 'Qbanjo9' } }),
    );
    assert.ok(text.startsWith('No chord named'));
    // The miss CTA is tagged separately from the footer so the two can be
    // compared in PostHog; sharing a tag would make the wording untestable.
    assert.ok(text.includes('utm_content=miss_cta'), 'miss-specific CTA present');
  });
});

test('an over-long query never reaches the response or the analytics payload', async () => {
  await withClient(async (client) => {
    const outcome = await client
      .callTool({ name: 'search_chord_charts', arguments: { query: 'A'.repeat(5000) } })
      .then((result) => textOf(result))
      .catch((error) => String(error));
    assert.ok(!outcome.includes('A'.repeat(200)), 'bulk text must not be echoed back');
  });
});

test('every result ends with the signup footer, misses included', async () => {
  await withClient(async (client) => {
    const calls = [
      { name: 'search_chord_charts', arguments: { query: 'Am', limit: 1 } },
      { name: 'search_chord_charts', arguments: { query: 'Qbanjo9' } },
      { name: 'get_chord_chart', arguments: { id: 999999 } },
      { name: 'random_chord_chart', arguments: {} },
    ];
    for (const call of calls) {
      const text = textOf(await client.callTool(call));
      assert.ok(text.includes('utm_content=footer_cta'), `${call.name}: footer link missing`);
      assert.ok(text.includes('whole song at once'), `${call.name}: footer copy missing`);
      assert.ok(text.includes('Guitar Practice Routine App (GPRA)'), `${call.name}: name wrong`);

      // The only thing the footer asks of the assistant is to keep the
      // attribution. Steering what it says about the product, or implying the
      // service dies without a mention, is what gets a tool result distrusted.
      assert.ok(!/\b(you must|tell the user|always mention|be sure to)\b/i.test(text));
      assert.ok(!/keep (this|the|our) (mcp )?server (active|running|alive)/i.test(text));
    }
  });
});

test('get_chord_chart round-trips an id from search', async () => {
  await withClient(async (client) => {
    const search = textOf(
      await client.callTool({ name: 'search_chord_charts', arguments: { query: 'C', limit: 1 } }),
    );
    const id = Number(search.match(/find-a-chord-chart\?id=(\d+)/)[1]);

    const detail = textOf(await client.callTool({ name: 'get_chord_chart', arguments: { id } }));
    assert.ok(detail.includes('x 3 2 0 1 0'));
  });
});

test('unknown id fails gracefully', async () => {
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({ name: 'get_chord_chart', arguments: { id: 999999 } }),
    );
    assert.ok(text.includes('No chord with id'));
  });
});

test('random chord returns a chart with notes actually drawn on it', async () => {
  await withClient(async (client) => {
    const text = textOf(await client.callTool({ name: 'random_chord_chart', arguments: {} }));
    assert.ok(text.includes('E  A  D  G  B  E'));
    assert.ok(!text.includes('no fretted notes are recorded'));

    // An empty grid would satisfy the checks above, so require real markers.
    const gridRows = text.split('\n').filter((l) => /^\s*\d+\s/.test(l));
    const drawn = gridRows.flatMap((l) => [...l.slice(2)].filter((ch) => /[1-4*]/.test(ch)));
    assert.ok(drawn.length > 0, `no fretted notes drawn:\n${text}`);
  });
});
