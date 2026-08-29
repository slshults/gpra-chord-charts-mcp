# Guitar chord charts — MCP server

A small, read-only [Model Context Protocol](https://modelcontextprotocol.io)
server that lets MCP-capable AI clients look up guitar chord charts from
[Guitar Practice Routine App (GPRA)](https://guitarpracticeroutine.com) and show
them to people as text chord diagrams.

It serves exactly what
[guitarpracticeroutine.com/find-a-chord-chart](https://guitarpracticeroutine.com/find-a-chord-chart)
serves: one chord name in, one chart out, from a bundled snapshot of the same
chord library. No database, no authentication, no secrets.

```
Am

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
 5  |  |  |  |  |  |
   -+--+--+--+--+--+-

x = muted   o = open   digits in grid = fingers (1 index, 2 middle, 3 ring, 4 pinky)
EADGBE
```

Frets run top to bottom from the nut, and string 1 — the highest-pitched
string — is the rightmost column, matching standard chord-box convention and
the charts on the site.

## Tools

| Tool | What it does |
| --- | --- |
| `get_chord_chart_by_name` | One chord name (`G`, `Am7`, `D/F#`) → the one chart the website shows for it. |
| `get_chord_chart_by_id` | The same chart by its numeric id, for re-rendering something already returned. |
| `get_chord_of_the_day` | Today's Chord of the Day — the same chord GPRA posts to Bluesky and Facebook. |

Every tool takes a `context` argument describing why it's being called. That's
what populates agent intent in analytics; nothing in the response depends on it.

## What's in the library

12,708 standard-tuning (EADGBE) voicings, **exactly one per chord name**. This
server does no fuzzy matching and no query cleanup — it passes the name through
the same way the website does, so the tool description asks the calling
assistant to send a plain chord name ("G", not "how do I play G major").

Charts are drawn on a five-fret grid starting at the nut, matching the site.
Where a voicing has notes above the fifth fret, they're named in words beneath
the chart rather than dropped.

## Connecting a client

Remote MCP means users add a **URL**, no install:

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

For a client that only speaks stdio, bridge with
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
npm run start:http # HTTP, listens on 127.0.0.1:2112, POST /mcp (set PORT / HOST)
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

`build:index` prints the library's fret range to the terminal and reports data
anomalies (voicings with no fretted notes, missing finger numbers, notes dropped
as unplayable) rather than quietly normalizing them away.

## Privacy

The hosted server records anonymous usage analytics through
[`@posthog/mcp`](https://www.npmjs.com/package/@posthog/mcp): which tool was
called, how long it took, whether it errored, the calling client's name and
version, and the `context` string the agent supplied. No personal identifier is
stored and no person profile is created.

Analytics are off entirely unless `POSTHOG_API_KEY` is set, so running this
yourself — including over stdio — sends nothing anywhere.

## Deployment

`deploy/` contains a systemd unit and an nginx reverse-proxy config, if you want
to host your own instance.

## Credits

The chord library exists because of other people's work:

- **[SVGuitar-ChordCollection](https://github.com/TormodKv/SVGuitar-ChordCollection)**
  by [@TormodKv](https://github.com/TormodKv) — the chord database this is built
  from, itself based on
  [chord-collection](https://github.com/T-vK/chord-collection) by
  [@T-vK](https://github.com/T-vK).
- **[SVGuitar](https://github.com/omnibrain/svguitar)** by
  [@omnibrain](https://github.com/omnibrain) — the chord-diagram renderer whose
  data format this uses, and which draws the charts on
  [guitarpracticeroutine.com](https://guitarpracticeroutine.com). (This server
  renders text, not SVG.)

## License

- **Code:** MIT — see `LICENSE`.
- **Chord data:** the voicings originate from SVGuitar-ChordCollection, which
  carries no stated licence, so no licence is asserted over them here. The
  fingerings themselves are factual descriptions of where fingers go on a
  fretboard. Please credit the projects above if you reuse the data.
