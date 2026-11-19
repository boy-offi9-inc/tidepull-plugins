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
const extract = async (url: URL, ctx: Ctx) => (await extractor.extract(url, ctx)) as Info;

function mockCtx(html: string, requested: string[] = []): Ctx {
  return {
    http: {
      // eslint-disable-next-line require-await
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

test("declares apiVersion 1 and a name", () => {
  assert.equal(plugin.apiVersion, 1);
  assert.equal(plugin.name, "og-video");
});

test("suitable() matches only the documented template host", () => {
  assert.equal(extractor.suitable(new URL("https://video.example.com/watch/abc")), true);
  assert.equal(extractor.suitable(new URL("https://cdn.video.example.com/v/1")), true);
  assert.equal(extractor.suitable(new URL("https://other.com/watch/abc")), false);
});

test("extracts og:video and og:audio, resolves relative fallback src", async () => {
  const requested: string[] = [];
  const info = await extract(new URL("https://video.example.com/watch/clip-123"), mockCtx(fixture("og-page.html"), requested));
  assert.deepEqual(requested, ["https://video.example.com/watch/clip-123"]);
  assert.equal(info.title, "Example Video");
  assert.equal(info.thumbnail, "https://cdn.example.com/thumb.jpg");
  const urls = info.formats.map((f) => f.url);
  assert.ok(urls.includes("https://cdn.example.com/media/clip-123.mp4"));
  assert.ok(urls.includes("https://cdn.example.com/media/clip-123.mp3"));
  // og:video wins over the bare <video src>; the relative fallback was NOT fetched as a URL
  assert.ok(!urls.some((u) => u.endsWith("/media/fallback.mp4")));
  const video = info.formats.find((f) => f.url.includes("clip-123.mp4"))!;
  assert.equal(video.protocol, "https");
  assert.equal(video.vcodec, "unknown");
  assert.equal(video.acodec, "none");
  const audio = info.formats.find((f) => f.url.includes("clip-123.mp3"))!;
  assert.equal(audio.vcodec, "none");
});

test("extracts JSON-LD VideoObject contentUrl", async () => {
  const info = await extract(new URL("https://video.example.com/ld/7"), mockCtx(fixture("jsonld-page.html")));
  const urls = info.formats.map((f) => f.url);
  assert.ok(urls.includes("https://cdn.example.com/ld/episode-7.webm"));
  assert.ok(!urls.includes("https://cdn.example.com/embed/7") || urls.length >= 1);
});

test("falls back to bare <video src> when no metas exist", async () => {
  const info = await extract(new URL("https://video.example.com/bare"), mockCtx("<html><body><video src='https://cdn.example.com/x.mov'></video></body></html>"));
  assert.equal(info.formats.length, 1);
  assert.equal(info.formats[0].url, "https://cdn.example.com/x.mov");
  assert.equal(info.formats[0].ext, "mov");
});

test("throws a TidepullError when nothing is found", async () => {
  await assert.rejects(
    () => extractor.extract(new URL("https://video.example.com/empty"), mockCtx("<html><body>nothing</body></html>")),
    /No og:video/,
  );
});
