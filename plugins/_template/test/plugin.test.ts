import assert from "node:assert/strict";
import test from "node:test";
import plugin from "../index.ts";

test("declares apiVersion 1 and a name", () => {
  assert.equal(plugin.apiVersion, 1);
  assert.ok(plugin.name);
});

test("suitable() matches only the site it claims", () => {
  const e = plugin.extractors![0];
  assert.equal(e.suitable(new URL("https://mysite.com/watch/abc")), true);
  assert.equal(e.suitable(new URL("https://other.com/watch/abc")), false);
});
