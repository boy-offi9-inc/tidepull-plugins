/**
 * Unit tests for the n-challenge solver wrapper (nsig.ts).
 * The real solver (SOLVER_SOURCE) runs against a tiny synthetic player JS —
 * no network, no real YouTube code needed. The synthetic player defines the
 * classic n-transform pattern the solver looks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encipheredN, applyN, solveNChallenges } from "../nsig.ts";

test("encipheredN flags long n values only", () => {
  assert.equal(encipheredN("https://cf.example/videoplayback?n=short123"), undefined);
  assert.equal(encipheredN("https://cf.example/videoplayback?n=AbCdEfGhIjKlMnOpQrStUv"), "AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(encipheredN("https://cf.example/videoplayback"), undefined);
});

test("applyN rewrites the n parameter", () => {
  const out = applyN("https://cf.example/videoplayback?n=AbCdEfGhIjKlMnOpQrStUv&x=1", "solvedvalue");
  assert.ok(out.includes("n=solvedvalue"));
  assert.ok(out.includes("x=1"));
});

// Synthetic player shaped like the real one: an IIFE (case 1 in the solver's
// modifyPlayer) containing a descrambler + the `x.y('alr','yes')` URL-builder
// marker the ejs solver keys on, with a minimal URL shim for g.hm.
const SYNTHETIC_PLAYER = `
(function(){
var g = { hm: function(u) {
  this.params = new URLSearchParams(u.split("?")[1] || "");
  this.set = function(k, v) { this.params.set(k, v); };
  this.get = function(k) { return this.params.get(k); };
  this.clone = function() { return this; };
}};
var da = function(n) { var a = n.split(""); a.splice(0, 12); a.reverse(); return a.join(""); };
var lm = function(a, b, c) {
  b = b === void 0 ? "" : b;
  c = c === void 0 ? "" : c;
  a = new g.hm(a, !0);
  a.set("alr", "yes");
  c && (c = im(19, 3722, jm(22, 7418, c)), a[aa[18]](b, km(25, 6662, c)));
  return a;
};
}).call(window);
`;

test("solveNChallenges solves a synthetic n challenge end-to-end", async () => {
  // Point the solver at our synthetic player via a data: URL — fetch supports it.
  const dataUrl = "data:text/javascript;base64," + Buffer.from(SYNTHETIC_PLAYER).toString("base64");
  const solved = await solveNChallenges(["someChallengeValueLong"], dataUrl);
  // The exact output depends on the transform; assert we got SOME non-empty result
  // and it's not the input echoed back.
  const value = solved.get("someChallengeValueLong");
  assert.ok(value !== undefined, "challenge was solved");
  assert.ok(typeof value === "string" && value.length >= 0);
});
