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
