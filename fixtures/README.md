# Fixtures

Recordings of a run, so you can build without the live server.

`demo.ndjson` is one JSON message per line, exactly what the server sends over the WebSocket:
the first line is `hello` (map, dial definitions, starting snapshot), then one `shift` message per shift.
It covers 30 shifts of seed `demo` on the Alpine valley, with fuzzy-brained miners (their reasoning is in each activity's `trace`), with a gold rush at shift 7, lightning at shift 15 and an earthquake at shift 22.

Make a fresh one (e.g. after the economy changes) with:

```
pnpm sim fixture --seed demo --shifts 30 --out fixtures/demo.ndjson
```
