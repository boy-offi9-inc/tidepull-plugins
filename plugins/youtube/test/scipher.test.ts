/**
 * Offline end-to-end fixture test for signatureCipher + s-decipher + n-decipher:
 * builds a synthetic player response carrying a signatureCipher format, a
 * synthetic player JS, and asserts the plugin deciphers both layers and emits
 * working URLs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import plugin from "../dist-youtube.ts";

const PLAYER_JS = `
(function(){
class HM {
  constructor(u) { this.params = new URLSearchParams(u.split("?")[1] || ""); }
  set(k, v) { this.params.set(k, v); }
  get(k) { return this.params.get(k); }
  clone() { return new HM(this.params.toString()); }
  validate() { var n = this.params.get("n"); if (n) this.params.set("n", da(n)); }
}
var g = { hm: HM };
var da = function(n) { var a = n.split(""); a.splice(0, 12); a.reverse(); return a.join(""); };
var lm = function(a, b, c) {
  b = b === void 0 ? "" : b;
  c = c === void 0 ? "" : c;
  a = new g.hm(a, !0);
  a.set("alr", "yes");
  if (c) a.set(b, da(c));
  return a;
};
}).call(window);
`;

const DATA_PLAYER = "/s/player/00000000/player_ias.vflset/en_US/base.js";

// The plugin fetches the player JS over the network; serve it from memory.
// A URL containing "deadbeef" simulates a rotated/404 player, for the failure test.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (u.includes("/s/player/")) {
    if (u.includes("deadbeef")) return new Response("not found", { status: 404 });
    return new Response(PLAYER_JS, { status: 200 });
  }
  return realFetch(input as never, init);
}) as typeof fetch;

function pageWith(formats: unknown[], playerUrl: string): string {
  const player = {
    videoDetails: { videoId: "abc123", title: "Test video" },
    playabilityStatus: { status: "OK" },
    streamingData: { formats, adaptiveFormats: [] },
  };
  return `<html><script>ytInitialPlayerResponse = ${JSON.stringify(player)};</script>
<script>var ytcfg={"INNERTUBE_CONTEXT":{"client":{"assets":{"js":"${playerUrl}"}}}};</script></html>`;
}

test("signatureCipher formats get s + n deciphered end-to-end", async () => {
  const cipher = new URLSearchParams({
    s: "signature-challenge-string-here",
    sp: "sig",
    url: "https://cf.example/videoplayback?id=xyz&mime=video/mp4&n=AbCdEfGhIjKlMnOpQrStUv",
  }).toString();
  const html = pageWith([{ itag: 18, mimeType: 'video/mp4; codecs="avc1, mp4a"', signatureCipher: cipher }], DATA_PLAYER);

  const ex = plugin.extractors![0];
  const info = (await ex.extract(new URL("https://www.youtube.com/watch?v=abc123"), {
    http: { async text() { return { text: html, finalUrl: "https://www.youtube.com/watch?v=abc123" }; } },
    log: { debug() {}, info() {}, warn() {} },
  } as never)) as { formats: Array<{ url: string }> };

  assert.equal(info.formats.length, 1, "cipher format was deciphered and kept");
  const url = String(info.formats[0].url);
  assert.ok(!url.includes("signature-challenge-string-here"), "s was replaced");
  assert.ok(!url.includes("sig=null") && /[?&]sig=[A-Za-z0-9_-]+/, "solved sig appended");
  assert.ok(!/n=AbCdEfGhIjKlMnOpQrStUv/.test(url), "n was replaced with the solved value");
});

test("broken solver leaves enciphered formats out instead of dead URLs", async () => {
  const cipher = new URLSearchParams({
    s: "signature-challenge-string-here",
    sp: "sig",
    url: "https://cf.example/videoplayback?id=xyz&n=AbCdEfGhIjKlMnOpQrStUv",
  }).toString();
  // player URL that 404s -> both solvers fail -> zero formats -> honest error
  const html = pageWith([{ itag: 18, mimeType: 'video/mp4; codecs="avc1, mp4a"', signatureCipher: cipher }], "/s/player/deadbeef/player.js");

  const ex = plugin.extractors![0];
  await assert.rejects(
    () => ex.extract(new URL("https://www.youtube.com/watch?v=abc123"), {
      http: { async text() { return { text: html, finalUrl: "" }; } },
      log: { debug() {}, info() {}, warn() {} },
    } as never),
    /No downloadable stream found/,
  );
});
