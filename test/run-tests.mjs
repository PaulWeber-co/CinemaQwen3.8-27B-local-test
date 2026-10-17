// CineMatch – Test-Runner
// Start: node test/run-tests.mjs
// Minimaler, DOM-freier Test-Runner (keine npm-Abhängigkeiten).
// Jeder nachfolgende Plan-Punkt hängt hier seine Unit-Tests an.

import assert from "node:assert/strict";
import { encodeCode, decodeCode } from "../src/core/codec.js";
import { computeMatch } from "../src/core/matcher.js";
import { catalog, catalogGenres, findFilmById, KNOWN_GENRES } from "../src/core/catalog.js";

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

console.log("\nPunkt 2 – Katalog\n");

test("Katalog enthält mindestens 35 Filme", () => {
  assert.ok(catalog.length >= 35, `erwartet >= 35, gefunden: ${catalog.length}`);
});

test("Katalog-Einträge haben vollständige Felder (id, title, year, genre, term)", () => {
  for (const f of catalog) {
    assert.ok(typeof f.id === "string" && f.id.length > 0, `id fehlt: ${JSON.stringify(f)}`);
    assert.ok(typeof f.title === "string" && f.title.length > 0, `title fehlt bei ${f.id}`);
    assert.ok(Number.isInteger(f.year) && f.year >= 1950 && f.year <= 2026, `year ungültig bei ${f.id}: ${f.year}`);
    assert.ok(KNOWN_GENRES.includes(f.genre), `genre unbekannt bei ${f.id}: ${f.genre}`);
    assert.ok(typeof f.term === "string" && f.term.length > 0, `term fehlt bei ${f.id}`);
  }
});

test("Katalog-IDs sind eindeutig", () => {
  const ids = catalog.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "doppelte ID im Katalog");
});

test("Alle zehn Genres sind im Katalog vertreten", () => {
  assert.deepEqual(catalogGenres(), [...KNOWN_GENRES].sort((a, b) => a.localeCompare(b)));
});

test("findFilmById liefert den passenden Film / undefined bei Unbekanntem", () => {
  assert.equal(findFilmById("inception-2010").title, "Inception");
  assert.equal(findFilmById("keine-id-diese-gibt-es-nicht"), undefined);
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed > 0 ? 1 : 0);
