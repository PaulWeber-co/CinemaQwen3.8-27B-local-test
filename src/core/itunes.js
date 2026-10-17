// CineMatch – iTunes-API-Client (Plan-Punkt 3)
// Holt für einen Suchbegriff Cover (hiRes) + Beschreibung (DE) aus der
// iTunes Search API und zwischenspeichert das Ergebnis.
//
// DOM-frei: fetch und storage werden per createItunesClient() injiziert,
// dadurch ist das Modul unter Node testbar (siehe test/run-tests.mjs).
// Für den Browser wird zusätzlich der fertige Singleton `ituns` exportiert,
// der globalThis.fetch + localStorage verwendet.
//
// Fallback-Vertrag: lookup() UND search() werfen NIE. Bei Netzwerk-Fehler,
// HTTP-Fehler, Zeitüberschreitung oder ohne Treffer kommt ein Ergebnis mit
// source: "fallback" (lookup: poster/description = null; search: hits = [])
// zurück – die UI zeigt dann Platzhalter + lokale Daten (Plan-Punkt 5/6).
//
// Caching lookup(): In-memory (pro Sitzung) + localStorage (besteht zwischen
// Sitzungen). Nur erfolgreiche iTunes-Ergebnisse werden in localStorage
// gelegt – ein Fallback wird nur in-memory gemerkt, damit nach
// Wiederherstellung der Verbindung erneut nachgeholt wird.
//
// Caching search(): NUR in-memory (pro Sitzung). Begründung: Gesuchte
// Begriffe sind unbeschränkt (Freitext) – jede persistierte Variante würde
// localStorage ohne Obergrenze füllen. Ein Retry nach Fallback funktioniert
// trotzdem, weil Fallbacks nicht gecacht werden.

const DEFAULT_BASE_URL = "https://itunes.apple.com/search";
const DEFAULT_TIMEOUT_MS = 8000;
const CACHE_PREFIX = "cinematch:itunes:";

/**
 * Erzeugt einen iTunes-Client.
 * @param {{
 *   fetch?: (url: string, init?: object) => Promise,  // injectierbarer fetch (Test/Mock)
 *   storage?: object|null,                            // localStorage-ähnliches Objekt
 *   country?: string,                                 // Store-Land (Standard: DE)
 *   baseUrl?: string,
 *   timeoutMs?: number
 * }} [options]
 */
export function createItunesClient({
  fetch: fetchImpl = null,
  storage = null,
  country = "DE",
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const memory = new Map();
  const searchMemory = new Map(); // search(): nur in-memory (s. Header)

  /**
   * Holt (oder liest aus dem Cache) Cover + Beschreibung für einen Suchbegriff.
   * @param {string} term z. B. "Inception 2010"
   * @param {{ forceRefresh?: boolean }} [options]
   * @returns {Promise<{
   *   term: string, title: string|null, poster: string|null,
   *   description: string|null, source: "itunes"|"fallback",
   *   reason: string|null, fromCache: boolean
   * }>}
   */
  async function lookup(term, { forceRefresh = false } = {}) {
    const key = normalizeTerm(term);
    if (!key) return fallback(key, "leerer Suchbegriff");
    const cacheKey = `${CACHE_PREFIX}${country}:${key}`;

    if (!forceRefresh) {
      const mem = memory.get(cacheKey);
      if (mem) return { ...mem, fromCache: true };
      const stored = readStorage(storage, cacheKey);
      if (stored) {
        memory.set(cacheKey, stored);
        return { ...stored, fromCache: true };
      }
    }

    const result = await fetchFromApi(key);

    // Erfolg → beide Cache-Ebenen; Fallback → nur in-memory (s. Header).
    memory.set(cacheKey, result);
    if (result.source === "itunes") writeStorage(storage, cacheKey, result);
    else memory.delete(cacheKey);
    return result;
  }

  /**
   * Livesuche (Plan-Punkt 6): liefert bis zu `limit` normalisierte Treffer
   * (id `it:<iTunes-ID>`, Titel, Jahr, Genre-Abbildung, hiRes-Poster,
   * Beschreibung). Wirft NIE – bei Fehlern/leeren Treffern kommt
   * source: "fallback" mit hits: [] (UI kann dann einen Hinweis zeigen).
   * @param {string} term z. B. "blade runner"
   * @param {{ limit?: number }} [options] 1..SEARCH_MAX_LIMIT, Standard 8
   * @returns {Promise<{
   *   hits: object[], source: "itunes"|"fallback",
   *   reason: string|null, fromCache: boolean
   * }>}
   */
  async function search(term, { limit = SEARCH_DEFAULT_LIMIT } = {}) {
    const key = normalizeTerm(term);
    if (!key) return searchFallback("leerer Suchbegriff");
    const safeLimit = Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.round(Number(limit) || SEARCH_DEFAULT_LIMIT)));
    const cacheKey = `${SEARCH_CACHE_PREFIX}${country}:${safeLimit}:${key}`;

    const mem = searchMemory.get(cacheKey);
    if (mem) return { ...mem, fromCache: true };

    const result = await fetchSearch(key, safeLimit);

    // Wie bei lookup(): nur Erfolg gecacht – Fallback bleibt retrybar.
    // Bewusst OHNE localStorage (unbeschränkte Freitext-Begriffe, s. Header).
    if (result.source === "itunes") searchMemory.set(cacheKey, result);
    return result;
  }

  /** Leert beide In-Memory-Caches + localStorage (eigene Keys nur). */
  function clearCache() {
    memory.clear();
    searchMemory.clear();
    clearStorage(storage, CACHE_PREFIX);
  }

  async function fetchFromApi(key) {
    const url =
      `${baseUrl}?media=movie&entity=movie&country=${country}` +
      `&limit=1&term=${encodeURIComponent(key)}`;

    if (!fetchImpl) return fallback(key, "offline (kein fetch verfügbar)");

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if (!res || !res.ok) return fallback(key, `HTTP ${res ? res.status : "?"}`);
      const data = await res.json();
      const raw = data && Array.isArray(data.results) ? data.results[0] : null;
      if (!raw) return fallback(key, "kein Treffer");

      return {
        term: key,
        title: raw.trackName || null,
        poster: toHiRes(raw.artworkUrl100 || raw.artworkUrl60),
        description: raw.longDescription || raw.shortDescription || null,
        source: "itunes",
        reason: null,
        fromCache: false,
      };
    } catch {
      // Netzwerk-Fehler, Timeout, kaputter JSON – alle → Fallback.
      return fallback(key, "Netzwerkfehler");
    }
  }

  async function fetchSearch(key, limit) {
    const url =
      `${baseUrl}?media=movie&entity=movie&country=${country}` +
      `&limit=${limit}&term=${encodeURIComponent(key)}`;

    if (!fetchImpl) return searchFallback("offline (kein fetch verfügbar)");

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if (!res || !res.ok) return searchFallback(`HTTP ${res ? res.status : "?"}`);
      const data = await res.json();
      const rawHits = data && Array.isArray(data.results) ? data.results : [];
      const hits = rawHits
        .map(normalizeHit)
        .filter((h) => h != null)
        .slice(0, limit); // API-Überschuss (limit-Kappung) abfangen
      if (hits.length === 0) return searchFallback("kein Treffer");

      return { hits, source: "itunes", reason: null, fromCache: false };
    } catch {
      // Netzwerk-Fehler, Timeout, kaputter JSON – alle → Fallback.
      return searchFallback("Netzwerkfehler");
    }
  }

  return { lookup, search, clearCache };
}

const SEARCH_CACHE_PREFIX = "cinematch:itunes-search:";
const SEARCH_DEFAULT_LIMIT = 8;
const SEARCH_MAX_LIMIT = 25;

/**
 * Mappt ein iTunes-Genre (englisch, aus `raw.genres`) auf eines der zehn
 * bekannten CineMatch-Genres (catalog.KNOWN_GENRES) oder null (kein Match,
 * z. B. "Music" – der Film bleibt nutzbar, das Genre-Feld bleibt leer).
 * "Sci-Fi & Fantasy" landet auf Sci-Fi (Best-Effort, Annahme Punkt 6a).
 */
const ITUNES_GENRE_MAP = {
  action: "Action",
  comedy: "Komödie",
  crime: "Krimi",
  documentary: "Dokumentarfilm",
  drama: "Drama",
  "sci-fi": "Sci-Fi",
  "sci-fi & fantasy": "Sci-Fi",
  fantasy: "Fantasy",
  horror: "Horror",
  thriller: "Thriller",
  animation: "Animation",
  animated: "Animation",
};

/**
 * Mappt ein iTunes-Genre-Label (unabhängig von Groß-/Kleinschreibung)
 * auf eines der zehn bekannten Genres; ohne Treffer null. Exportiert für Tests.
 */
export function mapGenre(rawGenre) {
  if (typeof rawGenre !== "string") return null;
  return ITUNES_GENRE_MAP[rawGenre.trim().toLowerCase()] ?? null;
}

/**
 * Extrahiert das Jahr aus einem iTunes-Datum (ISO-String z. B. "2010-03-16T…Z")
 * oder einem reinen Jahr; ohne gültiges Jahr null (DOM-freie Helfer aus Punkt 6a).
 */
function extractYear(value) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 1890 && value <= 2100 ? value : null;
  }
  if (typeof value !== "string") return null;
  const m = value.match(/(\d{4})/);
  const year = m ? Number(m[1]) : null;
  return year && year >= 1890 && year <= 2100 ? year : null;
}

/** Fallback-Ergebnis: UI kann mit Platzhalter + lokalen Daten weiterarbeiten. */
function fallback(term, reason) {
  return {
    term,
    title: null,
    poster: null,
    description: null,
    source: "fallback",
    reason,
    fromCache: false,
  };
}

/** Fallback-Ergebnis für search(): leere Trefferliste + Grund. */
function searchFallback(reason) {
  return { hits: [], source: "fallback", reason, fromCache: false };
}

/**
 * Baut aus einem rohen iTunes-Suchtreffer einen nutzbaren Film-Eintrag
 * (gleiche Felder wie der Katalog, id = `it:<iTunes-ID>` für Stabilität).
 */
function normalizeHit(raw) {
  const title =
    typeof raw?.trackName === "string" && raw.trackName.trim()
      ? raw.trackName.trim()
      : null;
  if (!title) return null; // Treffer ohne Titel ist für die UI wertlos
  const year = extractYear(raw.releaseDate ?? raw.primaryReleaseDate);
  const genre = Array.isArray(raw.genres) ? mapGenre(raw.genres[0]) : null;
  const id =
    raw.id != null && String(raw.id) !== ""
      ? `it:${raw.id}`
      : `it:slug-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}${year ? `-${year}` : ""}`;
  const term = `${title} ${year ?? ""}`.trim();
  return {
    id,
    title,
    year,
    genre,
    term,
    poster: toHiRes(raw.artworkUrl100 || raw.artworkUrl60),
    description: raw.longDescription || raw.shortDescription || null,
  };
}

/** Suchbegriff normalisieren (Cache-Key + API-Parameter). */
function normalizeTerm(term) {
  return String(term ?? "").trim().toLowerCase();
}

/**
 * Erzeugt aus einem iTunes-Cover-URL (60x60/100x100) die hiRes-Variante.
 * Das Muster "…bb" (z. B. "100x100bb.jpg") lässt sich sicher austauschen.
 */
function toHiRes(url) {
  if (typeof url !== "string" || !url) return null;
  return url.replace(/100x100bb/, "1000x1000bb").replace(/60x60bb/, "1000x1000bb");
}

function readStorage(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null; // defekter Eintrag/ungültiges JSON → Cache verfehlt
  }
}

function writeStorage(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota voll / privater Modus → Cache verfehlt, Funktion bleibt.
  }
}

function clearStorage(storage, prefix) {
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    // ignore – Cache-Räumen darf nie den App-Flow brechen
  }
}

/** Sicheren Zugriff auf browserliches localStorage (null, falls nicht da). */
function browserStorage() {
  try {
    if (typeof globalThis.localStorage === "object" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // z. B. Safari-Privatmodus → kein storage
  }
  return null;
}

/** Fertiger Client für den Browser (Node: ohne storage, mit fetch wenn vorhanden). */
export const ituns = createItunesClient({
  fetch: typeof globalThis.fetch === "function" ? globalThis.fetch : null,
  storage: browserStorage(),
});
