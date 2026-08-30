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

test('inline PNG bytes are opt-in, and come first when asked for', async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Am', context: CONTEXT, format: 'both' },
    });

    const kinds = result.content.map((c) => c.type);
    assert.deepEqual(kinds, ['image', 'text'], 'image first when explicitly requested');

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
      arguments: { name: 'D', context: CONTEXT, format: 'both' },
    });
    const bytes = Buffer.from(result.content[0].data, 'base64');
    // Two renders of the same chord must be byte-identical (deterministic, cached).
    const again = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'D', context: CONTEXT, format: 'both' },
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

    const byDefault = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Am', context: CONTEXT },
    });
    assert.deepEqual(
      byDefault.content.map((c) => c.type),
      ['text'],
      'default sends no image bytes — the URL carries the picture',
    );
  });
});

test('the chart image URL leads the text, before the ASCII grid', async () => {
  await withClient(async (client) => {
    const text = textOf(
      await client.callTool({
        name: 'get_chord_chart_by_name',
        arguments: { name: 'Am', context: CONTEXT },
      }),
    );
    const lines = text.split('\n');
    const urlLine = lines.findIndex((l) => l.startsWith('Chart image: https://'));
    const gridLine = lines.findIndex((l) => l.includes('E  A  D  G  B  E'));

    assert.ok(urlLine > 0, 'chart image URL present');
    assert.ok(urlLine < gridLine, 'the image URL comes before the ASCII grid');
    assert.match(lines[urlLine], /\/chart\/\d+\.png$/, 'a direct PNG URL, not a page');
    // The chord name still comes first, so the block is self-identifying.
    assert.equal(lines[0], 'Am');
  });
});

/**
 * The MCP Apps widget.
 *
 * Whether a host actually mounts the iframe is out of our hands — claude.ai
 * currently doesn't — so what's worth testing is the part we control: that a
 * chord result points at a widget, and that the widget resolves to real HTML
 * carrying that chord's image. If those hold, a host that renders MCP Apps has
 * everything it needs, and one that doesn't is unaffected.
 */
test('chord results carry a widget URI, and it resolves to that chord', async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: 'get_chord_chart_by_name',
      arguments: { name: 'Am', context: CONTEXT },
    });

    const uri = result._meta?.ui?.resourceUri;
    assert.ok(uri?.startsWith('ui://gpra-chord-charts/chart/'), `no widget URI: ${uri}`);
    assert.equal(result._meta['ui/resourceUri'], uri, 'both meta keys must agree');

    const id = uri.slice(uri.lastIndexOf('/') + 1);
    const resource = await client.readResource({ uri });
    const html = resource.contents[0];
    assert.equal(html.mimeType, 'text/html;profile=mcp-app');
    assert.match(html.text, /^<!DOCTYPE html>/);
    assert.ok(
      html.text.includes(`/chart/${id}.png`),
      'the widget must show this chord’s chart, not some other one',
    );
    assert.ok(html.text.includes('>Am</h1>'), 'widget must name the chord');
    // The widget is one layer, not a replacement. If a result ever stops
    // carrying the text chart, every host that doesn't render widgets loses
    // the answer entirely.
    assert.match(textOf(result), /Chart image: https:/);
  });
});

/**
 * No `structuredContent` on tool results.
 *
 * This is a regression test for a real one. Adding it looked free — a
 * machine-readable twin of the text — but a client that understands
 * structuredContent may render it *instead of* the content blocks, and one
 * measured doing exactly that: the whole answer collapsed to three JSON
 * fields, taking the chart, the attribution and the call to action with it.
 * The attribution is a commitment we make to the chord data's authors, so
 * anything that can displace the text block stays out of the result.
 */
test('results never carry structuredContent, which can displace the text', async () => {
  await withClient(async (client) => {
    for (const name of ['get_chord_chart_by_name', 'get_chord_of_the_day']) {
      const result = await client.callTool({
        name,
        arguments: name === 'get_chord_chart_by_name' ? { name: 'G', context: CONTEXT } : { context: CONTEXT },
      });
      assert.equal(result.structuredContent, undefined, `${name} must not set structuredContent`);
      assert.ok(textOf(result).includes('guitarpracticeroutine.com'), `${name} must keep its attribution`);
    }
  });
});

test('a widget URI for a chord that does not exist fails cleanly', async () => {
  await withClient(async (client) => {
    await assert.rejects(
      () => client.readResource({ uri: 'ui://gpra-chord-charts/chart/99999999' }),
      /No chord chart widget|not found/i,
    );
  });
});
