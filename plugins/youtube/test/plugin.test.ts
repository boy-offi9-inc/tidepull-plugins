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
  assert.equal(plugin.name, "youtube");
});

test("suitable() matches watch pages, shorts, live, embeds and youtu.be links", () => {
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/watch?v=abc123")), true);
  assert.equal(extractor.suitable(new URL("https://youtube.com/watch?v=abc123")), true);
  assert.equal(extractor.suitable(new URL("https://m.youtube.com/watch?v=abc123")), true);
  assert.equal(extractor.suitable(new URL("https://music.youtube.com/watch?v=abc123")), true);
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/shorts/abc123")), true);
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/live/abc123")), true);
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/embed/abc123")), true);
  assert.equal(extractor.suitable(new URL("https://youtu.be/abc123")), true);
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/")), false);
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/feed/subscriptions")), false);
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/results?search_query=x")), false);
  assert.equal(extractor.suitable(new URL("https://www.youtube.com/channel/UC123")), false);
  assert.equal(extractor.suitable(new URL("https://example.com/watch?v=abc123")), false);
  assert.equal(extractor.suitable(new URL("https://youtu.be/")), false);
});

test("extracts progressive and adaptive formats, sorted best-first", async () => {
  const requested: string[] = [];
  const info = await extract(new URL("https://www.youtube.com/watch?v=abc123"), mockCtx(fixture("video.html"), requested));
  assert.deepEqual(requested, ["https://www.youtube.com/watch?v=abc123"]);
  assert.equal(info.id, "abc123");
  assert.equal(info.title, "Example Video");
  assert.equal(info.extractor, "youtube");
  assert.equal(info.thumbnail, "https://i.example.com/vi/abc123/hd.jpg");
  // 1080p webm first, then 720p, 360p, audio, manifest — enciphered 2160p skipped
  assert.equal(info.formats[0].height, 1080);
  assert.equal(info.formats[0].vcodec, "vp9"); // first codec from the mimeType string
  const heights = info.formats.filter((f) => f.height).map((f) => f.height);
  assert.deepEqual(heights, [1080, 720, 360]);
  // every format URL must be directly playable (no deciphered-n)
  for (const f of info.formats) {
    const n = new URL(f.url).searchParams.get("n");
    if (n) assert.ok(n.length <= 12, `format ${f.format_id} has an enciphered n param`);
  }
  const audio = info.formats.find((f) => f.vcodec === "none");
  assert.ok(audio, "audio-only format present");
  assert.equal(audio!.ext, "mp4");
  assert.equal(audio!.acodec, "mp4a");
});

test("includes an unenciphered DASH manifest when the player provides one", async () => {
  const info = await extract(new URL("https://www.youtube.com/watch?v=abc123"), mockCtx(fixture("video.html")));
  const manifest = info.formats.find((f) => f.format_id === "yt-dash-manifest");
  assert.ok(manifest, "dash manifest format present");
  assert.equal(manifest!.protocol, "dash");
  assert.equal(manifest!.ext, "mpd");
});

test("normalizes youtu.be, shorts, live and embed URLs to a watch page", async () => {
  for (const href of [
    "https://youtu.be/abc123?t=30",
    "https://www.youtube.com/shorts/abc123",
    "https://www.youtube.com/live/abc123",
    "https://m.youtube.com/watch?v=abc123",
    "https://music.youtube.com/watch?v=abc123",
  ]) {
    const requested: string[] = [];
    await extract(new URL(href), mockCtx(fixture("video.html"), requested));
    assert.equal(requested[0], "https://www.youtube.com/watch?v=abc123", href);
  }
});

test("skips signatureCipher formats instead of failing", async () => {
  const html = fixture("video.html").replace(
    /"url":"(https:\/\/cf\.example\.com[^"]*itag=137[^"]*)"/,
    `"signatureCipher":"s=enciphered&sp=sig&url=${encodeURIComponent("https://cf.example.com/videoplayback?id=abc123&mime=video%2Fwebm&itag=137")}"`,
  );
  const info = await extract(new URL("https://www.youtube.com/watch?v=abc123"), mockCtx(html));
  // 1080p gone (it became a signatureCipher entry), 720p still there
  assert.equal(info.formats.some((f) => f.height === 1080), false);
  assert.equal(info.formats.some((f) => f.height === 720), true);
});

test("consent/bot wall: clear TidepullError, no formats", async () => {
  const requested: string[] = [];
  await assert.rejects(
    extract(new URL("https://www.youtube.com/watch?v=abc123"), mockCtx(fixture("consent.html"), requested)),
    (e: unknown) => e instanceof Error && /No player response/.test((e as Error).message),
  );
  assert.deepEqual(requested, ["https://www.youtube.com/watch?v=abc123"]);
});

test("LOGIN_REQUIRED playability: bot-wall error, not a deciphering error", async () => {
  await assert.rejects(
    extract(new URL("https://www.youtube.com/watch?v=abc123"), mockCtx(fixture("botwall.html"))),
    (e: unknown) => e instanceof Error && /bot check/.test((e as Error).message) && /README/.test((e as Error).message),
  );
});

test("all-formats-enciphered page: clear error mentioning deciphering", async () => {
  const html = fixture("video.html")
    // encipher every video URL's n param, give the audio one an n too, drop the manifest
    .replace(/&n=short[A-Z]/g, "&n=AbCdEfGhIjKlMnOpQrStUv")
    .replace(/(itag=140)(")/g, "$1&n=AbCdEfGhIjKlMnOpQrStUv$2")
    .replace(/"dashManifestUrl":"[^"]*",?/, "");
  await assert.rejects(
    extract(new URL("https://www.youtube.com/watch?v=abc123"), mockCtx(html)),
    (e: unknown) => e instanceof Error && /deciphering/.test((e as Error).message),
  );
});
