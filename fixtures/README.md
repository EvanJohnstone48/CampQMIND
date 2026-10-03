# Fixtures

Recordings of a run, so you can build without the live server.

`demo.ndjson` is one JSON message per line, exactly what the server sends over the WebSocket:
the first line is `hello` (map, dial definitions, starting snapshot), then one `shift` message per shift.
It covers 60 shifts of seed `demo`, with a gold rush at shift 15, lightning at shift 30 and an earthquake at shift 45.

Make a fresh one (e.g. after the economy changes) with:

```
pnpm sim fixture --seed demo --shifts 60 --out fixtures/demo.ndjson
```
