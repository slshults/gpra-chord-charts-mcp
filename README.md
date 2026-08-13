# Guitar chord charts — MCP server

A small, read-only [Model Context Protocol](https://modelcontextprotocol.io)
server that lets MCP-capable AI clients look up guitar chord charts from
[Guitar Practice Routine App (GPRA)](https://guitarpracticeroutine.com) and show
them to people as text chord diagrams.

It's a **thin, stateless wrapper** over a bundled snapshot of GPRA's chord
library — no database, no authentication, no secrets. Every result carries a
permalink to the chart on the site and an attribution note.

```
Am
x 0 2 2 1 0   (low to high: E A D G B E)

    E  A  D  G  B  E
    x  o           o
   ==================
 1  |  |  |  |  1  |
   -+--+--+--+--+--+-
 2  |  |  3  2  |  |
   -+--+--+--+--+--+-
 3  |  |  |  |  |  |
   -+--+--+--+--+--+-
 4  |  |  |  |  |  |
   -+--+--+--+--+--+-

x = muted   o = open   digits in grid = fingers (1 index, 2 middle, 3 ring, 4 pinky)
EADGBE · open position
```

Frets run top to bottom and string 1 — the highest-pitched string — is the
rightmost column, matching standard guitar chord-box convention.

## Tools

| Tool | What it does |
| --- | --- |
| `search_chord_charts` | Find voicings by name (`G`, `Cmaj7`, `D/F#`) and render each as a chart. Exact matches rank first, then prefixes, then substrings. Optional `limit` (default 3, max 10). |
| `get_chord_chart` | One voicing by numeric `id`, as returned by a search. |
| `random_chord_chart` | A random chart — practice prompts, chord of the day. |

Each chord is returned three ways in one block: a one-line grid (`x 0 2 2 1 0`,
low string to high), the chart itself, and a legend. The one-liner survives any
client that mangles whitespace.

## What's in the library

12,708 standard-tuning (EADGBE) voicings spanning **frets 1–16**, one voicing
per chord name, heavily weighted toward slash chords (11,637 of them). About
55% reach above the third fret.

Fingerings are stored as individual fretted notes — no row carries a barre
marking — so a shape a player would barre is drawn as separate dots. Finger
numbers exist for only a small hand-curated subset; everything else renders
fretted notes as plain dots. The tool descriptions say so, so assistants don't
over-trust the output.

## Connecting a client

Remote MCP means users add a **URL**, no install. In a client that supports
remote / custom MCP servers (Claude Desktop connectors, etc.), add:

```
https://mcp.guitarpracticeroutine.com/mcp
```

For clients configured with a JSON config file, use the streamable-HTTP
transport:

```json
{
  "mcpServers": {
    "gpra-chord-charts": {
      "type": "streamable-http",
      "url": "https://mcp.guitarpracticeroutine.com/mcp"
    }
  }
}
```

For a client that only speaks stdio, bridge to the remote server with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "gpra-chord-charts": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.guitarpracticeroutine.com/mcp"]
    }
  }
}
```

## Run locally

```bash
npm install
npm run build
npm test

npm start          # stdio transport
npm run start:http # HTTP, listens on 127.0.0.1:3030, POST /mcp (set PORT / HOST)
```

Health check: `GET /health` → status, version, chord count.

Preview charts from the terminal without a client:

```bash
npx tsx scripts/preview.ts G Am C F Bm D/F#
```

No CORS headers are set. Claude and connector directories fetch server-side, so
they don't need them — a browser-based MCP client would.

### Rebuilding the chord snapshot

Requires access to a GPRA database. The source table changes rarely, so this is
a manual step:

```bash
psql "$DATABASE_URL" -Atf scripts/dump-chords.sql > data/common-chords.raw.json
npm run build:index
npm run build && npm test
```

`build:index` prints the library's actual fret range and reports data anomalies
(voicings with no fretted notes, missing finger numbers, probable un-recorded
barres) rather than quietly normalizing them away.

## Privacy

The hosted server at `mcp.guitarpracticeroutine.com` records anonymous usage
analytics: which tool was called, the chord name searched for, and what kind of
client made the request (assistant, crawler, scanner…). **No identifier is
stored and no person profile is created** — each request gets a throwaway random
id, and caller-supplied fields are truncated.

Analytics are off entirely unless `POSTHOG_API_KEY` is set, so running this
yourself — including over stdio — sends nothing anywhere.

## Deployment

`deploy/` contains a systemd unit and an nginx reverse-proxy config, if you want
to host your own instance.

## License

- **Code:** MIT.
- **Data** served through it: © Guitar Practice Routine App — please keep the
  attribution that each tool response includes.
