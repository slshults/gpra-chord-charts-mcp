import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probedResourceUris, probeLogLine } from '../dist/probe.js';

const read = (uri) => ({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri } });

test('real widget URIs are not probes', () => {
  assert.deepEqual(probedResourceUris(read('ui://gpra-chord-charts/chart/42')), []);
  // A numeric id that doesn't exist is a stale reference, not a probe.
  assert.deepEqual(probedResourceUris(read('ui://gpra-chord-charts/chart/999999')), []);
});

test('wordlist URIs are probes, singly and in a batch', () => {
  assert.deepEqual(probedResourceUris(read('ui://gpra-chord-charts/chart/.env.test')), [
    'ui://gpra-chord-charts/chart/.env.test',
  ]);
  assert.deepEqual(
    probedResourceUris([
      read('ui://gpra-chord-charts/chart/7'),
      read('ui://gpra-chord-charts/chart/.ssh/id_rsa'),
      read('file:///etc/passwd'),
    ]),
    ['ui://gpra-chord-charts/chart/.ssh/id_rsa', 'file:///etc/passwd'],
  );
});

test('other methods and malformed bodies are ignored', () => {
  assert.deepEqual(probedResourceUris({ method: 'tools/call', params: { name: 'x' } }), []);
  assert.deepEqual(probedResourceUris(null), []);
  assert.deepEqual(probedResourceUris('nonsense'), []);
});

test('the advertised {id} template is not a probe', () => {
  assert.deepEqual(probedResourceUris(read('ui://gpra-chord-charts/chart/{id}')), []);
});

test('a big batch logs at most 5 lines, each bounded', () => {
  const batch = Array.from({ length: 50 }, (_, i) => read(`ui://x/${'a'.repeat(5000)}${i}`));
  const uris = probedResourceUris(batch);
  assert.equal(uris.length, 5);
  assert.ok(probeLogLine('1.2.3.4', uris[0]).length < 700);
});

test('a lone surrogate does not throw', () => {
  assert.doesNotThrow(() => probeLogLine('1.2.3.4', 'ui://x/\ud800'));
});

test('log line keeps caller-controlled text from forging fields', () => {
  const line = probeLogLine('91.237.122.51', 'ui://x/a b\nmcp-probe ip=1.2.3.4 uri=');
  assert.equal(line.split(' ').length, 3);
  assert.ok(!line.includes('\n'));
  assert.ok(line.startsWith('mcp-probe ip=91.237.122.51 uri='));
});
