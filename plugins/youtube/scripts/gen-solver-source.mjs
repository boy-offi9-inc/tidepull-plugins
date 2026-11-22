#!/usr/bin/env node
// Generates solver-source.ts: the yt-dlp ejs solver core as an inlined string,
// so the plugin can be bundled into ONE self-contained file.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../yt.solver.core.js", import.meta.url), "utf8");
// Escape backticks, backslashes and ${ so it survives a template literal.
const escaped = src.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const out = `/* AUTO-GENERATED from yt.solver.core.js (yt-dlp ejs solver, Unlicense). Do not edit. */
export const SOLVER_SOURCE = \`${escaped}\`;
`;
writeFileSync(new URL("../solver-source.ts", import.meta.url), out);
console.log(`solver-source.ts written (${out.length} bytes)`);
