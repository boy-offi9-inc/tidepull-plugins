import assert from "node:assert/strict";
import test from "node:test";
import { parseM3u8 } from "../src/index.ts";

const SAMPLE = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
seg0.ts
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x1
#EXTINF:9.009,second title
#EXT-X-BYTERANGE:1000@500
seg1.ts
#EXT-X-DISCONTINUITY
#EXTINF:4.0,
seg2.ts
#EXT-X-ENDLIST
`;

test("parses durations, titles, keys, byte ranges, discontinuity", () => {
  const pl = parseM3u8(SAMPLE);
  assert.equal(pl.version, 3);
  assert.equal(pl.targetDuration, 10);
  assert.equal(pl.endlist, true);
  assert.equal(pl.segments.length, 3);
  assert.equal(pl.segments[0].duration, 9.009);
  assert.equal(pl.segments[1].title, "second title");
  assert.deepEqual(pl.segments[1].byteRange, { length: 1000, offset: 500 });
  assert.equal(pl.segments[1].key?.method, "AES-128");
  assert.equal(pl.segments[1].key?.uri, "key.bin");
  assert.equal(pl.segments[2].discontinuity, true);
});

test("rejects non-m3u8 input", () => {
  assert.throws(() => parseM3u8("<html>nope</html>"), /not an m3u8/);
});
