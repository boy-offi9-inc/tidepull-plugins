import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Ctx } from "@boy-offi9-inc/tidepull";
import plugin from "../index.ts";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

const extractor = plugin.extractors![0];
type Info = import("@boy-offi9-inc/tidepull").Info;

function mockCtx(html: string, requested: string[] = []): Ctx {
  return {
    http: {
      text: async (url: string) => {
        requested.push(url);
        return { text: html, finalUrl: url, status: 200 };
      },
    } as unknown as Ctx["http"],
    log: () => {},
    emit: () => {},
    extractors: [],
  } as unknown as Ctx;
}

const extract = async (url: URL, ctx: Ctx) => (await extractor.extract(url, ctx)) as Info;

test("declares apiVersion 1 and a name", () => {
  assert.equal(plugin.apiVersion, 1);
  assert.equal(plugin.name, "soundcloud");
});

test("suitable() matches track pages and short links, rejects non-track paths", () => {
  assert.equal(extractor.suitable(new URL("https://soundcloud.com/artist/track")), true);
  assert.equal(extractor.suitable(new URL("https://www.soundcloud.com/artist/track")), true);
  assert.equal(extractor.suitable(new URL("https://on.soundcloud.com/abc12")), true);
  assert.equal(extractor.suitable(new URL("https://soundcloud.com/discover")), false);
  assert.equal(extractor.suitable(new URL("https://soundcloud.com/artist")), false);
  assert.equal(extractor.suitable(new URL("https://example.com/artist/track")), false);
});

test("extracts the og:audio progressive URL from a public track page", async () => {
  const requested: string[] = [];
  const info = await extract(new URL("https://soundcloud.com/example-artist/example-track"), mockCtx(fixture("track.html"), requested));
  assert.deepEqual(requested, ["https://soundcloud.com/example-artist/example-track"]);
  assert.equal(info.title, "Example Track by Example Artist");
  assert.equal(info.thumbnail, "https://cdn.example.com/art.jpg");
  assert.equal(info.formats.length, 1);
  const f = info.formats[0];
  assert.equal(f.url, "https://cf-media.example.com/stream/progressive/track-1.128.mp3");
  assert.equal(f.protocol, "https");
  assert.equal(f.vcodec, "none");
  assert.equal(f.acodec, "mp3");
});

test("falls back to script-data stream URLs when no og:audio exists", async () => {
  const html = fixture("track.html").replace(
    /<meta property="og:audio[^>]*>\n?/g,
    "",
  );
  const info = await extract(new URL("https://soundcloud.com/a/b"), mockCtx(html));
  assert.equal(info.formats.length, 1);
  assert.match(info.formats[0].url, /128/);
  assert.equal(info.formats[0].abr, 128);
  assert.match(info.formats[0].url, /stream\/progressive/);
});

test("throws a helpful TidepullError when no stream URL is found", async () => {
  await assert.rejects(
    () => extract(new URL("https://soundcloud.com/a/b"), mockCtx("<html><body>js app</body></html>")),
    /tidepull-plugins\/issues/,
  );
});

test("resolves /media/ endpoints via scraped client_id into real stream URLs", async () => {
  const requested: string[] = [];
  const html = fixture("track.html")
    .replace(
      "https://cf-media.example.com/stream/progressive/track-1.128.mp3",
      "https://api-v2.soundcloud.com/media/soundcloud:tracks:293/fa250033/stream/hls",
    )
    .replace("</body>", '<script src="https://a-v2.sndcdn.com/assets/51-a1b2c3-3da69d0a.js"></script></body>');
  const clientId = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  const info = await extract(new URL("https://soundcloud.com/a/b"), {
    ...mockCtx(html, requested),
    http: {
      ...mockCtx(html, requested).http,
      async text(url: string) {
        requested.push(url);
        if (url.includes("/assets/")) {
          return { text: `window.__sc = { client_id: "${clientId}" };`, finalUrl: url };
        }
        if (url.includes("/media/")) {
          assert.ok(url.includes(`client_id=${clientId}`), "media request must carry client_id");
          return { text: JSON.stringify({ url: "https://cf-media.example.com/hls/playlist.m3u8" }), finalUrl: url };
        }
        return { text: html, finalUrl: url };
      },
    },
  } as never);
  assert.equal(info.formats.length, 1);
  const f = info.formats[0];
  assert.equal(f.url, "https://cf-media.example.com/hls/playlist.m3u8");
  assert.equal(f.protocol, "hls");
  assert.equal(f.format_id, "sc-og-audio-resolved");
});

test("scrapes the inline client_id from the new Next.js page and resolves media endpoints", async () => {
  const requested: string[] = [];
  const html = fixture("track.html")
    .replace(
      "https://cf-media.example.com/stream/progressive/track-1.128.mp3",
      "https://api-mobi.soundcloud.com/media/soundcloud:tracks:293/fa250033/stream/hls",
    )
    .replace("</body>", '<script>window.__sc_config={"client_id=KKzJxmw11tYpCs6T24P4uUYhqmjalG6M&app_version=1"};</script></body>');
  const info = await extract(new URL("https://soundcloud.com/a/b"), {
    ...mockCtx(html, requested),
    http: {
      ...mockCtx(html, requested).http,
      async text(url: string) {
        requested.push(url);
        if (url.includes("/media/")) {
          assert.ok(url.includes("client_id=KKzJxmw11tYpCs6T24P4uUYhqmjalG6M"));
          return { text: JSON.stringify({ url: "https://playback.media-streaming.soundcloud.cloud/x/aac_160k/y/playlist.m3u8?expires=1" }), finalUrl: url };
        }
        return { text: html, finalUrl: url };
      },
    },
  } as never);
  assert.equal(info.formats[0].protocol, "hls");
  assert.match(info.formats[0].url, /media-streaming\.soundcloud\.cloud/);
});

test("fails loudly when /media/ endpoints exist but no client_id can be scraped", async () => {
  const html = fixture("track.html").replace(
    "https://cf-media.example.com/stream/progressive/track-1.128.mp3",
    "https://api-mobi.soundcloud.com/media/soundcloud:tracks:293/fa250033/stream/hls",
  );
  await assert.rejects(
    () => extract(new URL("https://soundcloud.com/a/b"), mockCtx(html)),
    /no client_id to authorize/,
  );
});
