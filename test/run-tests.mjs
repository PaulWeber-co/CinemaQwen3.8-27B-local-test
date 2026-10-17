// CineMatch – Test-Runner
// Start: node test/run-tests.mjs
// Minimaler, DOM-freier Test-Runner (keine npm-Abhängigkeiten).
// Jeder nachfolgende Plan-Punkt hängt hier seine Unit-Tests an.

import assert from "node:assert/strict";
import { encodeCode, decodeCode } from "../src/core/codec.js";
import { computeMatch } from "../src/core/matcher.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

console.log("CineMatch – Unit-Tests\n");

test("Smoke: codec.js & matcher.js sind importierbar und exportieren ihre API", () => {
  assert.equal(typeof encodeCode, "function", "encodeCode fehlt");
  assert.equal(typeof decodeCode, "function", "decodeCode fehlt");
  assert.equal(typeof computeMatch, "function", "computeMatch fehlt");
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed > 0 ? 1 : 0);
