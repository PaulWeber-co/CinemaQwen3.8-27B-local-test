// CineMatch – Test-Runner
// Start: node test/run-tests.mjs
// Minimaler, DOM-freier Test-Runner (keine npm-Abhängigkeiten).
// Jeder nachfolgende Plan-Punkt hängt hier seine Unit-Tests an.

import assert from "node:assert/strict";
import { encodeCode, decodeCode } from "../src/core/codec.js";
import { computeMatch } from "../src/core/matcher.js";
import { catalog, catalogGenres, findFilmById, KNOWN_GENRES } from "../src/core/catalog.js";
import { createItunesClient, ituns, mapGenre } from "../src/core/itunes.js";
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
import {
  CUSTOM_FILMS_STORAGE_KEY,
  MAX_CUSTOM_FILMS,
  normalizeCustomFilms,
  dedupeKeys,
  mergeSearchHits,
  saveCustomFilms,
  loadCustomFilms,
} from "../src/core/search.js";
import { fallbackPoster, posterHue } from "../src/ui/step2.js";

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

console.log("\nPunkt 5b – Schritt-2-UI (reine Helfer)\n");

test("step2: fallbackPoster liefert SVG-Data-URI mit Titel-Initialen und Jahr", () => {
  const uri = fallbackPoster({ id: "inception-2010", title: "Inception", year: 2010 });
  assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/, "keine SVG-Data-URI");
  const svg = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
  assert.match(svg, /<svg/, "kein SVG-Markup");
  assert.match(svg, />I<\/text>/, "Initialen fehlen im SVG"); // "Inception" → "I"
  assert.match(svg, /2010/, "Jahr fehlt im SVG");
});

test("step2: fallbackPoster ist deterministisch (gleiche ID → gleiche URI)", () => {
  const film = { id: "the-dark-knight-2008", title: "Der dunkle Ritter", year: 2008 };
  assert.equal(fallbackPoster(film), fallbackPoster({ ...film }));
});

test("step2: Poster-Farbvariation unterscheidet sich je Film (Hue 0..359, Hash)", () => {
  const a = posterHue("inception-2010");
  const b = posterHue("titanic-1997");
  assert.ok(Number.isInteger(a) && a >= 0 && a < 360, `hue a ungültig: ${a}`);
  assert.ok(Number.isInteger(b) && b >= 0 && b < 360, `hue b ungültig: ${b}`);
  assert.notEqual(a, b, "zwei Filme landen auf derselben Farbe");
});

test("step2: fallbackPoster ignoriert Artikel in Initialen und verträgt kaputte Daten", () => {
  const dark = fallbackPoster({ id: "x-1", title: "Der dunkle Ritter", year: 2008 });
  assert.match(decodeURIComponent(dark.slice(dark.indexOf(",") + 1)), /DR</, "Initialen sollen 'DR' sein");
  const empty = fallbackPoster({ id: "y-2", title: "", year: 1999 });
  assert.match(decodeURIComponent(empty.slice(empty.indexOf(",") + 1)), /\?\?</, "leerer Titel → '??'");
});

console.log("\nPunkt 6a – iTunes-Livesuche (Kern)\n");

// --- Test-Doubles ---------------------------------------------------------

const RAW_HIT_A = {
  id: 887305516,
  trackName: "Inception",
  releaseDate: "2010-07-15T19:50:11Z",
  genres: ["Sci-Fi & Fantasy", "Drama"],
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/inc/100x100bb.jpg",
  longDescription: "Träume in Träumen.",
};

const RAW_HIT_B = {
  id: 999,
  trackName: "Ein Unbekannter",
  releaseDate: "1995-03-01T00:00:00Z",
};

function makeSearchResponse(hits) {
  return okResponse({ resultCount: hits.length, results: hits });
}

// --- Tests -----------------------------------------------------------------

test("mapGenre: iTunes-Genres → CineMatch-Genres, unbekanntes/null → null", () => {
  assert.equal(mapGenre("Comedy"), "Komödie");
  assert.equal(mapGenre("crime"), "Krimi");
  assert.equal(mapGenre("Sci-Fi & Fantasy"), "Sci-Fi", "Annahme: Sci-Fi & Fantasy → Sci-Fi");
  assert.equal(mapGenre("Documentary"), "Dokumentarfilm");
  assert.equal(mapGenre("Animation"), "Animation");
  assert.equal(mapGenre("Music"), null);
  assert.equal(mapGenre(null), null);
});

test("search: Erfolg → normalisierte Treffer (it:<id>, Jahr, Genre, hiRes-Poster, Term)", async () => {
  const client = createItunesClient({
    fetch: () => Promise.resolve(makeSearchResponse([RAW_HIT_A, RAW_HIT_B])),
  });
  const r = await client.search("inception");
  assert.equal(r.source, "itunes");
  assert.equal(r.fromCache, false);
  assert.equal(r.hits.length, 2);
  assert.equal(r.hits[0].id, "it:887305516");
  assert.equal(r.hits[0].title, "Inception");
  assert.equal(r.hits[0].year, 2010, "Jahr aus releaseDate");
  assert.equal(r.hits[0].genre, "Sci-Fi");
  assert.match(r.hits[0].poster, /1000x1000bb\.jpg$/, "Poster muss hiRes sein");
  assert.equal(r.hits[0].term, "Inception 2010");
  assert.equal(r.hits[1].year, 1995);
  assert.equal(r.hits[1].genre, null, "ohne genres-Feld → null");
  assert.equal(r.hits[1].description, null);
});

test("search: limit wird auf 1..25 geklemmt und in die URL übernommen", async () => {
  let url;
  const client = createItunesClient({
    fetch: (u) => { url = u; return Promise.resolve(makeSearchResponse([])); },
  });
  await client.search("blade runner", { limit: 999 });
  assert.match(url, /limit=25/, "Obergrenze 25 fehlt in URL");
  assert.match(url, /term=blade%20runner/, "normalisierter Term fehlt in URL");
  await client.search("blade runner", { limit: -3 });
  assert.match(url, /limit=1/, "Untergrenze 1 fehlt in URL");
  await client.search("blade runner"); // Standard
  assert.match(url, /limit=8/, "Standard-Limit 8 fehlt in URL");
});

test("search: in-memory-Cache – gleiche Anfrage ohne zweiten API-Call, fromCache=true", async () => {
  const { fetchImpl, calls } = makeFakeFetch(() => Promise.resolve(makeSearchResponse([RAW_HIT_A])));
  const client = createItunesClient({ fetch: fetchImpl });
  const first = await client.search("Inception");
  assert.equal(first.fromCache, false);
  const second = await client.search("  inception  "); // normalisiert → identisch
  assert.equal(second.fromCache, true);
  assert.equal(calls(), 1, "erwartet 1 API-Call für beide Suchen");
  assert.deepEqual(second.hits, first.hits);
});

test("search: Netzwerkfehler → Fallback mit leeren hits, wirft nie", async () => {
  const client = createItunesClient({
    fetch: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  const r = await client.search("anything");
  assert.equal(r.source, "fallback");
  assert.deepEqual(r.hits, []);
  assert.match(r.reason, /Netzwerkfehler/);
});

test("search: HTTP-Fehler, leer, ohne fetch, leerer Begriff → Fallback mit Grund", async () => {
  const http = createItunesClient({
    fetch: () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
  });
  assert.match((await http.search("x")).reason, /500/);
  const empty = createItunesClient({
    fetch: () => Promise.resolve(okResponse({ resultCount: 0, results: [] })),
  });
  assert.match((await empty.search("x")).reason, /kein Treffer/i);
  assert.match((await createItunesClient({ fetch: null }).search("x")).reason, /offline/i);
  assert.match((await createItunesClient().search("   ")).reason, /leer/i);
});

test("search: Treffer ohne Titel entfallen; fehlende iTunes-ID → stabile Slug-Id", async () => {
  const client = createItunesClient({
    fetch: () =>
      Promise.resolve(
        okResponse({
          resultCount: 3,
          results: [
            { trackName: "" }, // ohne Titel → verworfen
            { trackName: "   " }, // nur Leerzeichen → verworfen
            { trackName: "Some Unknown Film", releaseDate: "2004-01-01T00:00:00Z" }, // ohne id
          ],
        })
      ),
  });
  const r = await client.search("some");
  assert.equal(r.hits.length, 1, "nur der Titel-Treffer bleibt");
  assert.equal(r.hits[0].id, "it:slug-some-unknown-film-2004");
  assert.equal(r.hits[0].poster, null, "ohne artwork-URL → null");
});

test("search: Ergebnis NICHT in localStorage (unbeschränkte Freitext-Begriffe); clearCache leert In-Memory", async () => {
  const storage = new FakeStorage();
  const { fetchImpl, calls } = makeFakeFetch(() => Promise.resolve(makeSearchResponse([RAW_HIT_A])));
  const client = createItunesClient({ fetch: fetchImpl, storage });
  await client.search("inception");
  assert.equal(storage.length, 0, "Suchergebnisse dürfen nicht persistent gecacht werden");
  client.clearCache();
  await client.search("inception");
  assert.equal(calls(), 2, "erwartet neuen API-Call nach clearCache");
});

test("search: Fallback wird nicht gecacht → Retry nach Re-Online liefert Treffer", async () => {
  let online = false;
  const client = createItunesClient({
    fetch: () =>
      online
        ? Promise.resolve(makeSearchResponse([RAW_HIT_A]))
        : Promise.reject(new TypeError("offline")),
  });
  const off = await client.search("inception");
  assert.equal(off.source, "fallback");
  online = true;
  const on = await client.search("inception");
  assert.equal(on.source, "itunes");
  assert.equal(on.hits.length, 1);
});

console.log("\nPunkt 6a – Custom-Filme (src/core/search.js)\n");

test("dedupeKeys: Titel-Schlüssel klein + Jahr-Suffix normalisiert; DE-Titel und EN-term als Schlüssel", () => {
  const keys = dedupeKeys({
    id: "the-dark-knight-2008",
    title: "Der dunkle Ritter",
    year: 2008,
    term: "The Dark Knight 2008",
  });
  assert.ok(keys.has("der dunkle ritter 2008"), "Titel-Schlüssel mit Jahr fehlt");
  assert.ok(keys.has("the dark knight 2008"), "Term-Schlüssel (Englisch) fehlt");
  assert.equal(keys.size, 2);
});

test("mergeSearchHits: neue Treffer kommen hinzu, Eingabe-Array bleibt unmutiert", () => {
  const films = [catalog.find((f) => f.id === "inception-2010")];
  const snapshot = JSON.stringify(films);
  const { films: merged, added } = mergeSearchHits(films, [
    { id: "it:123", title: "Blade Runner", year: 1982, genre: "Sci-Fi", term: "Blade Runner 1982" },
  ]);
  assert.equal(JSON.stringify(films), snapshot, "Eingabe wurde mutiert");
  assert.equal(added.length, 1);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].id, "it:123");
});

test("mergeSearchHits: Duplikat per ID wird übersprungen", () => {
  const { films, added } = mergeSearchHits(
    [{ id: "it:123", title: "Blade Runner", year: 1982 }],
    [{ id: "it:123", title: "Blade Runner", year: 1982 }]
  );
  assert.deepEqual(added, []);
  assert.equal(films.length, 1);
});

test("mergeSearchHits: DE<->EN – Treffer The Dark Knight (2008) = Katalog Der dunkle Ritter", () => {
  const films = [catalog.find((f) => f.id === "the-dark-knight-2008")];
  const { films: merged, added } = mergeSearchHits(films, [
    { id: "it:463278206", title: "The Dark Knight", year: 2008, genre: "Action", term: "The Dark Knight 2008" },
  ]);
  assert.deepEqual(added, [], "muss über den Term-Schlüssel als Duplikat erkannt werden");
  assert.equal(merged.length, 1);
});

test("mergeSearchHits: gleicher Titel+Jahr innerhalb einer Charge wird nicht doppelt aufgenommen", () => {
  const { films, added } = mergeSearchHits([], [
    { id: "it:1", title: "Some Film", year: 2001 },
    { id: "it:2", title: "some film", year: 2001 }, // gleiche "Titel Jahr"-Signatur, andere ID
  ]);
  assert.equal(added.length, 1, "zweiter Treffer derselben Vorlage ist Duplikat");
  assert.equal(films.length, 1);
});

test("mergeSearchHits: unvollständige Treffer (null/ohne id/ohne title) werden verworfen", () => {
  const { films, added } = mergeSearchHits([], [
    null,
    { title: "Keine ID" },
    { id: "it:7" },
    { id: "", title: "" },
  ]);
  assert.deepEqual(added, []);
  assert.deepEqual(films, []);
});

test("Custom-Filme: Save/Load-Roundtrip; kaputtes JSON → []; null-Storage → kein Crash", () => {
  const s = new FakeStorage();
  const films = [
    { id: "it:1", title: "Blade Runner", year: 1982, genre: "Sci-Fi", term: "Blade Runner 1982", poster: null, description: null },
  ];
  assert.equal(saveCustomFilms(s, films), true);
  assert.equal(s.getItem(CUSTOM_FILMS_STORAGE_KEY), JSON.stringify(films));
  assert.deepEqual(loadCustomFilms(s), films);
  s.setItem(CUSTOM_FILMS_STORAGE_KEY, "{ kaputt");
  assert.deepEqual(loadCustomFilms(s), [], "kaputtes JSON → leere Liste");
  assert.deepEqual(loadCustomFilms(null), []);
  assert.equal(saveCustomFilms(null, films), false, "null-Storage → Persistenz aus");
});

test("normalizeCustomFilms: defensiva – kaputte Einträge/Doppel-IDs raus, MAX_CUSTOM_FILMS als Obergrenze", () => {
  const raw = [
    { id: "it:1", title: "A" },
    { id: "it:1", title: "A" }, // doppelte ID → raus
    { id: "it:2" }, // ohne Titel → raus
    { id: "it:3", title: "C" },
  ];
  assert.deepEqual(normalizeCustomFilms(raw).map((f) => f.id), ["it:1", "it:3"]);
  const many = Array.from({ length: MAX_CUSTOM_FILMS + 10 }, (_, i) => ({ id: `it:${i}`, title: `F${i}` }));
  assert.equal(normalizeCustomFilms(many).length, MAX_CUSTOM_FILMS);
  assert.deepEqual(normalizeCustomFilms("kaputt"), []);
  assert.deepEqual(normalizeCustomFilms(null), []);
});

await Promise.allSettled(pending); // asynchrone Tests (Punkt 3) bis zum Abschluss laufen lassen

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed > 0 ? 1 : 0);
