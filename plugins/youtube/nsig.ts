/**
 * n-challenge solving for YouTube formats.
 *
 * Uses yt-dlp's official ejs solver core (yt.solver.core.js, Unlicense) +
 * meriyah/astring to parse the player JS, locate the n-transform function,
 * and evaluate it for each challenge. Everything runs locally in-process.
 *
 * Fails soft: any error means formats keep their enciphered n and the plugin
 * reports honestly (no fake deciphered URLs).
 */
import { createRequire } from "node:module";
import { SOLVER_SOURCE } from "./solver-source.ts";

const require = createRequire(import.meta.url);

// Lazily constructed singleton: { jsc, cache }
let solverState: { jsc: (input: unknown) => SolverOutput; cache: Map<string, string> } | undefined;

interface SolverOutput {
  type: string;
  responses: Array<{ type: string; data?: Record<string, string>; error?: string }>;
}

function loadSolver(): NonNullable<typeof solverState> {
  if (solverState) return solverState;
  // The vendored solver core assigns to `var jsc = (function(meriyah, astring){...})(...)`
  // NOTE: in the standalone bundle (scripts/build-standalone.mjs) this function body
  // is REPLACED with inline construction from the ESC_* strings — no deps needed.
  const { parse } = require("meriyah") as { parse: unknown };
  const { generate } = require("astring") as { generate: unknown };
  const factory = new Function("meriyah", "astring", `"use strict";\n${SOLVER_SOURCE}\nreturn jsc;`);
  const jsc = factory({ parse }, { generate }) as (input: unknown) => SolverOutput;
  solverState = { jsc, cache: new Map() };
  return solverState;
}

/** Fetch the player JS (absolute URLs pass through; relative paths join onto www.youtube.com). */
async function fetchPlayerJs(playerUrl: string, signal?: AbortSignal): Promise<string> {
  if (playerUrl.startsWith("data:")) {
    return Buffer.from(playerUrl.split(",")[1] ?? "", "base64").toString("utf8");
  }
  const target = playerUrl.startsWith("http") ? playerUrl : `https://www.youtube.com${playerUrl}`;
  const res = await fetch(target, {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching player JS ${playerUrl}`);
  return await res.text();
}

/**
 * Solve a batch of n challenges for a given player URL.
 * Returns a Map<challenge, solved>. Throws on hard failure — caller decides
 * whether to skip those formats or error out.
 */
export async function solveNChallenges(challenges: string[], playerUrl: string, signal?: AbortSignal): Promise<Map<string, string>> {
  const unique = [...new Set(challenges)];
  const state = loadSolver();

  const out = new Map<string, string>();
  const pending: string[] = [];
  for (const c of unique) {
    const key = `${playerUrl}::${c}`;
    const cached = state.cache.get(key);
    if (cached !== undefined) out.set(c, cached);
    else pending.push(c);
  }
  if (pending.length === 0) return out;

  // Preprocess the player once per player URL (the solver handles this via type:'player').
  const playerJs = await fetchPlayerJs(playerUrl, signal);
  const result = state.jsc({
    type: "player",
    player: playerJs,
    requests: [{ type: "n", challenges: pending }],
  });
  if (result.type !== "result") throw new Error(`solver failed: ${JSON.stringify(result).slice(0, 200)}`);
  for (const resp of result.responses) {
    if (resp.type === "result" && resp.data) {
      for (const [challenge, solved] of Object.entries(resp.data)) {
        state.cache.set(`${playerUrl}::${challenge}`, solved);
        out.set(challenge, solved);
      }
    } else {
      throw new Error(`n-solve failed: ${resp.error ?? "unknown"}`);
    }
  }
  for (const c of pending) {
    if (!out.has(c)) throw new Error(`n-solve missing result for challenge ${c}`);
  }
  return out;
}

/** True when the URL carries an enciphered n challenge. */
export function encipheredN(u: string): string | undefined {
  const n = new URL(u).searchParams.get("n") ?? "";
  return n.length > 12 ? n : undefined;
}

/** Replace the n parameter in a videoplayback URL with its solved value. */
export function applyN(u: string, solved: string): string {
  const url = new URL(u);
  url.searchParams.set("n", solved);
  return url.toString();
}
