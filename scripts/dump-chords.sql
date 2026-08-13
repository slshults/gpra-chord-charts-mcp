-- Dump every row of common_chords as a single JSON array.
-- Run with: psql "$DATABASE_URL" -Atf scripts/dump-chords.sql > data/common-chords.raw.json
--
-- Emits raw column values (name, chord_data, order_col). Normalization into the
-- shape the MCP server serves happens in scripts/build-index.mjs, so the SQL
-- stays a dumb extract and the reshaping logic lives somewhere testable.
SELECT json_agg(t ORDER BY t.order_col, t.id)
FROM (
    SELECT id, name, chord_data, order_col
    FROM common_chords
) t;
