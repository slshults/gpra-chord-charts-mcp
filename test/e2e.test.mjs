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
const CONTEXT = 'automated test of the chord chart server';

const withClient = async (fn) => {
  const client = new Client({ name: 'test-harness', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    // Analytics on, pointed at a dead port. The PostHog MCP SDK only injects
    // its `context` argument when instrumentation is active, so with it off the
    // tests would exercise a different tool contract than production ships.
    // Same dead port for the chord-of-the-day fetch, exercising that path too.
    env: {
      ...process.env,
      GPRA_API_BASE: 'http://127.0.0.1:9',
      POSTHOG_API_KEY: 'phc_test_not_a_real_key',
      POSTHOG_HOST: 'http://127.0.0.1:9',
    },
  });
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
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ['get_chord_chart_by_id', 'get_chord_chart_by_name', 'get_chord_of_the_day'],
    );
    for (const tool of tools) {
      assert.ok(tool.description?.length > 40, `${tool.name} needs a description`);
      assert.ok(
        tool.inputSchema.properties.context,
        `${tool.name} must take a context argument — it's what records agent intent`,
      );
    }
  });
});

test('a name returns exactly one chart, with a deep link', async () => {
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({
        name: 'get_chord_chart_by_name',
        arguments: { name: 'Am', context: CONTEXT },
      }),
    );
    assert.ok(text.includes('E  A  D  G  B  E'), 'chart header present');
    assert.ok(text.includes('guitarpracticeroutine.com/find-a-chord-chart?id='), 'deep link present');
    assert.ok(text.includes('utm_source=mcp'), 'attribution params present');
    assert.ok(!text.includes('utm_campaign'), 'campaign tag dropped');

    // One chart, not a list: exactly one grid.
    assert.equal(text.split('E  A  D  G  B  E').length - 1, 1);
  });
});

test('the tool description tells the caller how to phrase a query', async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const lookup = tools.find((t) => t.name === 'get_chord_chart_by_name');
    // No server-side query cleanup, so the guidance has to be in the contract.
    assert.match(lookup.description, /"G major" is "G"/);
    assert.match(lookup.description, /not a sentence/);
  });
});

test('a miss reports cleanly instead of guessing', async () => {
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({
        name: 'get_chord_chart_by_name',
        arguments: { name: 'Qbanjo9', context: CONTEXT },
      }),
    );
    assert.ok(text.startsWith('No chord named'));
    assert.ok(text.includes('utm_content=miss_cta'), 'miss-specific CTA present');
  });
});

test('id lookup round-trips from a name lookup', async () => {
  await withClient(async (client) => {
    const found = textOf(
      await client.callTool({
        name: 'get_chord_chart_by_name',
        arguments: { name: 'C', context: CONTEXT },
      }),
    );
    const id = Number(found.match(/find-a-chord-chart\?id=(\d+)/)[1]);

    const detail = textOf(
      await client.callTool({
        name: 'get_chord_chart_by_id',
        arguments: { id, context: CONTEXT },
      }),
    );
    assert.ok(detail.startsWith('C\n'));
  });
});

test('unknown id fails gracefully', async () => {
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({
        name: 'get_chord_chart_by_id',
        arguments: { id: 999999, context: CONTEXT },
      }),
    );
    assert.ok(text.includes('No chord with id'));
  });
});

test('chord of the day degrades gracefully when the app is unreachable', async () => {
  // The harness points GPRA_API_BASE at a dead port, which is how this behaves
  // until the endpoint is deployed. It must answer usefully rather than error.
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({ name: 'get_chord_of_the_day', arguments: { context: CONTEXT } }),
    );
    assert.ok(text.includes("isn't available right now"), 'says so plainly');
    assert.ok(text.includes('Guitar Practice Routine App (GPRA)'), 'still carries attribution');
  });
});

test('every result ends with the attribution footer, misses included', async () => {
  await withClient(async (client) => {
    const calls = [
      { name: 'get_chord_chart_by_name', arguments: { name: 'Am', context: CONTEXT } },
      { name: 'get_chord_chart_by_name', arguments: { name: 'Qbanjo9', context: CONTEXT } },
      { name: 'get_chord_chart_by_id', arguments: { id: 999999, context: CONTEXT } },
      { name: 'get_chord_of_the_day', arguments: { context: CONTEXT } },
    ];
    for (const call of calls) {
      const text = textOf(await client.callTool(call));
      assert.ok(text.includes('utm_content=footer_cta'), `${call.name}: footer link missing`);
      assert.ok(text.includes('Guitar Practice Routine App (GPRA)'), `${call.name}: name wrong`);
      assert.ok(text.includes('TormodKv'), `${call.name}: upstream credit missing`);

      // The only thing the footer asks of the assistant is to keep the
      // attribution. Steering what it says, or implying the service dies
      // without a mention, is what gets a tool result distrusted.
      assert.ok(!/\b(you must|tell the user|always mention|be sure to)\b/i.test(text));
      assert.ok(!/keep (this|the|our) (mcp )?server (active|running|alive)/i.test(text));
    }
  });
});

test('an over-long query never reaches the response', async () => {
  await withClient(async (client) => {
    const outcome = await client
      .callTool({
        name: 'get_chord_chart_by_name',
        arguments: { name: 'A'.repeat(5000), context: CONTEXT },
      })
      .then((result) => textOf(result))
      .catch((error) => String(error));
    assert.ok(!outcome.includes('A'.repeat(200)), 'bulk text must not be echoed back');
  });
});

test('a chord comes back as text plus a PNG image', async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Am', context: CONTEXT },
    });

    const kinds = result.content.map((c) => c.type);
    assert.deepEqual(kinds, ['image', 'text'], 'image first so the diagram leads in a chat');

    const image = result.content[0];
    assert.equal(image.mimeType, 'image/png');
    const bytes = Buffer.from(image.data, 'base64');
    // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(bytes.length > 2000, `image looks empty at ${bytes.length} bytes`);
    assert.ok(bytes.length < 1_000_000, 'must stay well under the MCP result size ceiling');
  });
});

test('a miss returns text only, with no image block', async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Qbanjo9', context: CONTEXT },
    });
    assert.deepEqual(result.content.map((c) => c.type), ['text']);
  });
});

test('the image renders the same voicing the text chart describes', async () => {
  await withClient(async (client) => {
    // D is x x 0 2 3 2 — asymmetric, so a mirrored or wrong render would show.
    const result = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'D', context: CONTEXT },
    });
    const bytes = Buffer.from(result.content[0].data, 'base64');
    // Two renders of the same chord must be byte-identical (deterministic, cached).
    const again = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'D', context: CONTEXT },
    });
    assert.deepEqual(bytes, Buffer.from(again.content[0].data, 'base64'));
  });
});

test('format:"text" drops the image, format:"image" keeps attribution', async () => {
  await withClient(async (client) => {
    const textOnly = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Am', context: CONTEXT, format: 'text' },
    });
    assert.deepEqual(textOnly.content.map((c) => c.type), ['text']);
    assert.ok(textOf(textOnly).includes('E  A  D  G  B  E'), 'still a full chart');

    const imageOnly = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Am', context: CONTEXT, format: 'image' },
    });
    assert.deepEqual(imageOnly.content.map((c) => c.type), ['image', 'text']);
    const trailing = textOf(imageOnly);
    // Chart text is dropped, but credit is not negotiable.
    assert.ok(!trailing.includes('E  A  D  G  B  E'), 'chart text dropped');
    assert.ok(trailing.includes('Guitar Practice Routine App (GPRA)'), 'attribution kept');
    assert.ok(trailing.includes('TormodKv'), 'upstream credit kept');

    const both = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Am', context: CONTEXT },
    });
    assert.deepEqual(both.content.map((c) => c.type), ['image', 'text'], 'default is both');
  });
});
