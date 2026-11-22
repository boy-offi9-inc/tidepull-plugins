import plugin from "../dist-youtube.ts";
const cipher = new URLSearchParams({ s: "signature-challenge-string-here", sp: "sig", url: "https://cf.example/videoplayback?id=xyz&n=AbCdEfGhIjKlMnOpQrStUv" }).toString();
const player = { videoDetails: { videoId: "abc", title: "T" }, playabilityStatus: { status: "OK" }, streamingData: { formats: [{ itag: 18, mimeType: "video/mp4", signatureCipher: cipher }], adaptiveFormats: [] } };
const html = `<script>ytInitialPlayerResponse = ${JSON.stringify(player)};</script><script>var ytcfg={"INNERTUBE_CONTEXT":{"client":{"assets":{"js":"/s/player/00000000/player.js"}}}};</script>`;
const PLAYER = `(function(){var g={hm:function(u){this.params=new URLSearchParams(u.split("?")[1]||"");this.set=function(k,v){this.params.set(k,v)};this.get=function(k){return this.params.get(k)};this.clone=function(){return this}}};var da=function(n){var a=n.split("");a.splice(0,12);a.reverse();return a.join("")};var lm=function(a,b,c){b=b===void 0?"":b;c=c===void 0?"":c;a=new g.hm(a,!0);a.set("alr","yes");return a}}).call(window);`;
const rf = globalThis.fetch;
globalThis.fetch = async (i) => { const u = typeof i === "string" ? i : i.url; if (u.includes("/s/player/")) return new Response(PLAYER, { status: 200 }); return rf(i); };
try {
  const info = await plugin.extractors[0].extract(new URL("https://www.youtube.com/watch?v=abc"), {
    http: { async text() { return { text: html, finalUrl: "" }; } },
    log: { debug(m) { console.log("[dbg]", m); }, info() {}, warn(m) { console.log("[warn]", m); } },
  });
  console.log("OK formats:", info.formats.length, String(info.formats[0]?.url).slice(0, 140));
} catch (e) { console.log("ERR", e.message); }
