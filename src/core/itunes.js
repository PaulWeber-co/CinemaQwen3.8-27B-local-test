// CineMatch – iTunes-API-Client (Plan-Punkt 3)
// Holt für einen Suchbegriff Cover (hiRes) + Beschreibung (DE) aus der
// iTunes Search API und zwischenspeichert das Ergebnis.
//
// DOM-frei: fetch und storage werden per createItunesClient() injiziert,
// dadurch ist das Modul unter Node testbar (siehe test/run-tests.mjs).
// Für den Browser wird zusätzlich der fertige Singleton `ituns` exportiert,
// der globalThis.fetch + localStorage verwendet.
//
// Fallback-Vertrag: lookup() wirft NIE. Bei Netzwerk-Fehler, HTTP-Fehler,
// Zeitüberschreitung oder ohne Treffer kommt ein Ergebnis mit
// source: "fallback" und poster/description = null zurück (die UI zeigt dann
// Platzhalter-Cover + lokalen Titel, siehe Plan-Punkt 5).
//
// Caching: In-memory (pro Sitzung) + localStorage (besteht zwischen Sitzungen).
// WICHTIG: Nur erfolgreiche iTunes-Ergebnisse werden in localStorage gelegt –
// ein Fallback wird nur in-memory gemerkt, damit nach Wiederherstellung der
// Verbindung erneut nachgeholt wird.

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

  /** Leert In-Memory- und localStorage-Cache (eigene Keys nur). */
  function clearCache() {
    memory.clear();
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

  return { lookup, clearCache };
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
