// CineMatch – Test-Runner
// Start: node test/run-tests.mjs
// Minimaler, DOM-freier Test-Runner (keine npm-Abhängigkeiten).
// Jeder nachfolgende Plan-Punkt hängt hier seine Unit-Tests an.

import assert from "node:assert/strict";
import { encodeCode, decodeCode } from "../src/core/codec.js";
import { computeMatch } from "../src/core/matcher.js";
import { catalog, catalogGenres, findFilmById, KNOWN_GENRES } from "../src/core/catalog.js";
import { createItunesClient, ituns } from "../src/core/itunes.js";
import {
  PROFILE_STORAGE_KEY,
  MAX_GENRES,
  emptyProfile,
  normalizeName,
  normalizeProfile,
  toggleGenre,
  saveProfile,
  loadProfile,
} from "../src/core/profile.js";
import {
  RATINGS_STORAGE_KEY,
  MAX_STARS,
  emptyRatings,
  normalizeRatings,
  setStars,
  toggleWatchlist,
  resetFilm,
  watchedCount,
  saveRatings,
  loadRatings,
} from "../src/core/ratings.js";

let passed = 0;
let failed = 0;

const pending = []; // ausstehende asynchrone Tests (Plan-Punkt 3)

function test(name, fn) {
  const report = (err) => {
    if (err) {
      failed++;
      console.error(`  FAIL ${name}`);
      console.error(`       ${err.message}`);
    } else {
      passed++;
      console.log(`  ok   ${name}`);
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      pending.push(result);
      result.then(() => report(null), report);
    } else {
      report(null);
    }
  } catch (err) {
    report(err);
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

console.log("\nPunkt 3 – iTunes-Client\n");

// --- Test-Doubles ---------------------------------------------------------

/** localStorage-Nachbau (in-memory). */
class FakeStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

const ITUNES_HIT = {
  resultCount: 1,
  results: [
    {
      trackName: "Inception",
      artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/xyz/100x100bb.jpg",
      longDescription: "Dom Cobb dringt in Träume ein, um eine Idee in den Kopf eines Ziels zu pflanzen.",
    },
  ],
};

// --- Tests -----------------------------------------------------------------

function makeFakeFetch(impl) {
  let calls = 0;
  return {
    fetchImpl: (url, init) => { calls++; return impl(url, init); },
    calls: () => calls,
  };
}

test("API: createItunesClient liefert lookup/clearCache, Singleton `ituns` existiert", () => {
  const client = createItunesClient();
  assert.equal(typeof client.lookup, "function", "lookup fehlt");
  assert.equal(typeof client.clearCache, "function", "clearCache fehlt");
  assert.equal(typeof ituns.lookup, "function", "Singleton ituns fehlgerichtet");
});

test("Erfolg: hiRes-Cover (1000x1000bb), Titel + Beschreibung, source=itunes", async () => {
  const { fetchImpl, calls } = makeFakeFetch(() => Promise.resolve(okResponse(ITUNES_HIT)));
  const client = createItunesClient({ fetch: fetchImpl });
  const r = await client.lookup("Inception 2010");
  assert.equal(r.source, "itunes");
  assert.equal(r.title, "Inception");
  assert.match(r.poster, /1000x1000bb\.jpg$/, `Poster nicht hiRes: ${r.poster}`);
  assert.match(r.description, /Träume/);
  assert.equal(calls(), 1);
});

test("API-URL: enthält media=movie, country=DE und URI-kodierten Suchbegriff", async () => {
  let url;
  const client = createItunesClient({
    fetch: (u) => { url = u; return Promise.resolve(okResponse(ITUNES_HIT)); },
  });
  await client.lookup("The Matrix 1999");
  assert.match(url, /media=movie/);
  assert.match(url, /country=DE/);
  assert.match(url, /term=the%20matrix%201999/); // normalisiert (lowercase) + URI-kodiert
});

test("In-Memory-Cache: zweiter Lookup ohne API-Call, fromCache=true", async () => {
  const { fetchImpl, calls } = makeFakeFetch(() => Promise.resolve(okResponse(ITUNES_HIT)));
  const client = createItunesClient({ fetch: fetchImpl });
  await client.lookup("inception 2010");
  const r2 = await client.lookup("Inception 2010"); // normalisiert → gleicher Key
  assert.equal(calls(), 1, "erwartet 1 API-Call, gab es 2");
  assert.equal(r2.fromCache, true);
  assert.equal(r2.source, "itunes");
});

test("localStorage-Cache: zweite Client-Instanz (neue Sitzung) ohne API-Call", async () => {
  const storage = new FakeStorage();
  const first = createItunesClient({
    fetch: () => Promise.resolve(okResponse(ITUNES_HIT)), storage,
  });
  await first.lookup("Inception 2010");
  assert.ok(storage.length >= 1, "Erfolg wurde nicht in localStorage gespeichert");

  const { fetchImpl, calls } = makeFakeFetch(() => Promise.resolve(okResponse(ITUNES_HIT)));
  const second = createItunesClient({ fetch: fetchImpl, storage });
  const r = await second.lookup("Inception 2010");
  assert.equal(calls(), 0, "erwartet Cache-Treffer aus storage, aber API-Call");
  assert.equal(r.fromCache, true);
  assert.equal(r.source, "itunes");
});

test("Netzwerkfehler (fetch rejectet) → Fallback, wirft nie", async () => {
  const { fetchImpl } = makeFakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
  const client = createItunesClient({ fetch: fetchImpl });
  const r = await client.lookup("Inception 2010");
  assert.equal(r.source, "fallback");
  assert.equal(r.poster, null);
  assert.equal(r.description, null);
  assert.ok(r.reason, "Fallback-Grund fehlt");
});

test("HTTP 404 → Fallback", async () => {
  const client = createItunesClient({
    fetch: () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }),
  });
  const r = await client.lookup("Kein Film XYZ");
  assert.equal(r.source, "fallback");
  assert.match(r.reason, /404/);
});

test("Kein Treffer (resultCount=0) → Fallback", async () => {
  const client = createItunesClient({
    fetch: () => Promise.resolve(okResponse({ resultCount: 0, results: [] })),
  });
  const r = await client.lookup("Unbekanntes Meisterwerk 1999");
  assert.equal(r.source, "fallback");
  assert.match(r.reason, /kein Treffer/i);
});

test("Kaputtes JSON → Fallback (wirft nie)", async () => {
  const client = createItunesClient({
    fetch: () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }),
  });
  const r = await client.lookup("Inception 2010");
  assert.equal(r.source, "fallback");
});

test("Fallback wird NICHT in localStorage geparkt (Retry nach Re-Online möglich)", async () => {
  const storage = new FakeStorage();
  const offline = createItunesClient({
    fetch: () => Promise.reject(new TypeError("offline")), storage,
  });
  await offline.lookup("Inception 2010");
  assert.equal(storage.length, 0, "Fallback darf nicht persistent gecacht werden");

  // Neuer Client mit funktionierender Verbindung → API wird erneut angefragt.
  const { fetchImpl, calls } = makeFakeFetch(() => Promise.resolve(okResponse(ITUNES_HIT)));
  const online = createItunesClient({ fetch: fetchImpl, storage });
  const r = await online.lookup("Inception 2010");
  assert.equal(calls(), 1, "erwartet Retry nach Fallback");
  assert.equal(r.source, "itunes");
  assert.ok(storage.length >= 1, "erfolgreiches Ergebnis wurde nicht geparkt");
});

test("Kein fetch (Offline-Modus) → sofortiger Fallback ohne Crash", async () => {
  const client = createItunesClient({ fetch: null });
  const r = await client.lookup("Inception 2010");
  assert.equal(r.source, "fallback");
  assert.match(r.reason, /offline/i);
});

test("clearCache: leert localStorage und erzwingt neuen API-Call", async () => {
  const storage = new FakeStorage();
  const { fetchImpl, calls } = makeFakeFetch(() => Promise.resolve(okResponse(ITUNES_HIT)));
  const client = createItunesClient({ fetch: fetchImpl, storage });
  await client.lookup("Inception 2010");
  assert.ok(storage.length >= 1);

  client.clearCache();
  assert.equal(storage.length, 0, "clearCache hat eigene storage-Keys nicht entfernt");
  await client.lookup("Inception 2010");
  assert.equal(calls(), 2, "erwartet API-Call nach clearCache");
});

console.log("\nPunkt 4 – Profil (Schritt 1)\n");

test("Profil-API: MAX_GENRES=5, leeres Profil als Fallback", () => {
  assert.equal(MAX_GENRES, 5);
  assert.deepEqual(emptyProfile(), { name: "", genres: [] });
});

test("normalizeName: trimmt und kürzt bei 40 Zeichen, Nicht-String → leer", () => {
  assert.equal(normalizeName("  Paul  "), "Paul");
  assert.equal(normalizeName("x".repeat(99)).length, 40);
  assert.equal(normalizeName(42), "");
  assert.equal(normalizeName(null), "");
});

test("normalizeProfile: bekannte Genres ohne Duplikate, max. 5, in Reihung", () => {
  const p = normalizeProfile({
    name: "  Anna  ",
    genres: ["Action", "Action", "Sci-Fi", "unbekannt", "Drama", "Horror", "Thriller", "Krimi"],
  });
  assert.equal(p.name, "Anna");
  assert.deepEqual(p.genres, ["Action", "Sci-Fi", "Drama", "Horror", "Thriller"]);
});

test("normalizeProfile: kaputte/leere Eingaben → leeres Profil, wirft nie", () => {
  assert.deepEqual(normalizeProfile(null), emptyProfile());
  assert.deepEqual(normalizeProfile("string"), emptyProfile());
  assert.deepEqual(normalizeProfile({ name: 42, genres: "Action" }), emptyProfile());
});

test("toggleGenre: an-/abschalten, unbekanntes Genre bleibt ignoriert", () => {
  let p = toggleGenre(emptyProfile(), "Action").profile;
  assert.deepEqual(p.genres, ["Action"]);
  p = toggleGenre(p, "Action").profile; // wieder ab
  assert.deepEqual(p.genres, []);
  const unknown = toggleGenre(emptyProfile(), "Musical");
  assert.equal(unknown.atLimit, false);
  assert.deepEqual(unknown.profile.genres, []);
});

test("toggleGenre: max. 5 Genres – sechstes wird blockiert (atLimit), Abschalten bleibt möglich", () => {
  const full = { name: "", genres: ["Action", "Drama", "Sci-Fi", "Horror", "Thriller"] };
  const blocked = toggleGenre(full, "Krimi");
  assert.equal(blocked.atLimit, true);
  assert.equal(blocked.profile.genres.length, 5);
  const removed = toggleGenre(full, "Drama");
  assert.equal(removed.atLimit, false);
  assert.equal(removed.profile.genres.length, 4);
});

test("Profil: Save/Load-Roundtrip über (Fake-)-Storage", () => {
  const s = new FakeStorage();
  const p = { name: "Paul", genres: ["Action", "Komödie"] };
  assert.equal(saveProfile(s, p), true);
  assert.equal(s.getItem(PROFILE_STORAGE_KEY), JSON.stringify(p));
  assert.deepEqual(loadProfile(s), p);
});

test("Profil: kaputtes JSON → leeres Profil, wirft nie", () => {
  const s = new FakeStorage();
  s.setItem(PROFILE_STORAGE_KEY, "{ kaputt");
  assert.deepEqual(loadProfile(s), emptyProfile());
});

test("Profil: Storage explizit null (Offline-Modus) → kein Crash, kein Write", () => {
  assert.deepEqual(loadProfile(null), emptyProfile());
  assert.equal(saveProfile(null, { name: "x" }), false);
});

console.log("\nPunkt 5a – Bewertungen (Schritt 2)\n");

test("Bewertungen-API: MAX_STARS=5, leerer Zustand als Fallback", () => {
  assert.equal(MAX_STARS, 5);
  assert.deepEqual(emptyRatings(), { films: {} });
});

test("Bewertungen: setStars 1–5 erzeugt Eintrag, 0 entfernt ihn (unberührt)", () => {
  let r = setStars(emptyRatings(), "inception-2010", 4);
  assert.deepEqual(r.films["inception-2010"], { stars: 4, watchlist: false });
  assert.equal(watchedCount(r), 1);
  r = setStars(r, "inception-2010", 0);
  assert.equal("inception-2010" in r.films, false, "stars=0 muss den Eintrag entfernen");
  assert.equal(watchedCount(r), 0);
});

test("Bewertungen: unzulässige Sterne-Werte werden geklemmt (7→5, negativ/Nicht-Zahl→0)", () => {
  assert.equal(setStars(emptyRatings(), "f", 7).films["f"].stars, 5, "7 Sterne werden auf 5 geklemmt");
  assert.equal(setStars(emptyRatings(), "f", -2).films["f"], undefined, "negativ → 0 → Eintrag entfernt");
  assert.equal(setStars(emptyRatings(), "f", "abc").films["f"], undefined, "nicht-numerisch unmöglich");
  const rounded = setStars(emptyRatings(), "f", 3.6);
  assert.equal(rounded.films["f"].stars, 4, "3.6 → auf 4 gerundet");
});

test("Bewertungen: toggleWatchlist an/aus, Watchlist-only-Eintrag (stars 0) bleibt erhalten", () => {
  let r = toggleWatchlist(emptyRatings(), "f");
  assert.deepEqual(r.films["f"], { stars: 0, watchlist: true });
  r = toggleWatchlist(r, "f");
  assert.equal("f" in r.films, false, "abschalten + keine Sterne → Eintrag weg");
  const withStars = setStars(emptyRatings(), "f", 2);
  const wl = toggleWatchlist(withStars, "f");
  assert.deepEqual(wl.films["f"], { stars: 2, watchlist: true });
});

test("Bewertungen: resetFilm räumt Sterne UND Watchlist ab", () => {
  let r = setStars(emptyRatings(), "f", 5);
  r = toggleWatchlist(r, "f");
  assert.deepEqual(r.films["f"], { stars: 5, watchlist: true });
  const reset = resetFilm(r, "f");
  assert.equal("f" in reset.films, false, "nach Reset muss der Eintrag weg sein");
});

test("Bewertungen: Mutationsschutz – Eingangsobjekt bleibt unverändert", () => {
  const before = { films: { f: { stars: 3, watchlist: false } } };
  const snapshot = JSON.stringify(before);
  setStars(before, "f", 1);
  toggleWatchlist(before, "f");
  resetFilm(before, "f");
  assert.equal(JSON.stringify(before), snapshot, "setStars/toggle/reset dürfen nicht mutieren");
});

test("Bewertungen: defensive normalizeRatings (kaputte/externe Daten)", () => {
  assert.deepEqual(normalizeRatings(null), emptyRatings());
  assert.deepEqual(normalizeRatings("quatsch"), emptyRatings());
  const r = normalizeRatings({
    films: {
      "a": { stars: 9, watchlist: "ja" },        // 9 → 5, watchlist-String → false
      "b": { stars: 2, watchlist: true },
      "": { stars: 5, watchlist: true },          // leere ID → verworfen
      "c": 42,                                    // kein Objekt → verworfen
      "d": { stars: 0, watchlist: false },        // leer → verworfen
    },
  });
  assert.deepEqual(r.films["a"], { stars: 5, watchlist: false });
  assert.deepEqual(r.films["b"], { stars: 2, watchlist: true });
  assert.equal(Object.keys(r.films).length, 2, `erwartet 2 Einträge, gab es ${Object.keys(r.films).length}`);
});

test("Bewertungen: watchedCount zählt nur Sterne >= 1, Watchlist-only nicht", () => {
  const r = normalizeRatings({
    films: { "a": { stars: 5, watchlist: true }, "b": { stars: 1, watchlist: false }, "c": { stars: 0, watchlist: true } },
  });
  assert.equal(watchedCount(r), 2);
});

test("Bewertungen: Save/Load-Roundtrip über (Fake-)-Storage", () => {
  const s = new FakeStorage();
  const r = setStars(emptyRatings(), "inception-2010", 4);
  assert.equal(saveRatings(s, r), true);
  assert.equal(s.getItem(RATINGS_STORAGE_KEY), JSON.stringify(r));
  assert.deepEqual(loadRatings(s), r);
});

test("Bewertungen: kaputtes JSON → leeres Objekt, wirft nie", () => {
  const s = new FakeStorage();
  s.setItem(RATINGS_STORAGE_KEY, "{ kaputt");
  assert.deepEqual(loadRatings(s), emptyRatings());
});

test("Bewertungen: Storage explizit null (Offline-Modus) → kein Crash, kein Write", () => {
  assert.deepEqual(loadRatings(null), emptyRatings());
  assert.equal(saveRatings(null, setStars(emptyRatings(), "f", 3)), false);
});

await Promise.allSettled(pending); // asynchrone Tests (Punkt 3) bis zum Abschluss laufen lassen

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed > 0 ? 1 : 0);
