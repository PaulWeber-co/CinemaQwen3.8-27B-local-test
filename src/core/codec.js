// CineMatch – Codec (Plan-Punkt 7a)
// Teilt den Benutzer-Zustand als kompakten Share-Code: versioniertes,
// kompaktes JSON → Unicode-sicheres Base64 (umgekehrt beim Einfügen).
//
// DOM-frei (TextEncoder/TextDecoder statt btoa/atob über Bytes), damit das
// Modul unter Node testbar ist (siehe test/run-tests.mjs).
//
// Kanonische Datenform (userData), die encodeCode/decodeCode/computeMatch
// (Punkt 8) gemeinsam verwenden:
//   {
//     v: 1,                                  // Code-Version (Vorwärts-Kompatibilität)
//     name: string,                          // max. MAX_NAME_LENGTH
//     genres: string[],                      // ⊆ KNOWN_GENRES, max. MAX_GENRES, ohne Duplikate
//     films: { [id]: 1..5 },                // nur bewertete Filme (0 = fehlt, "unberührt")
//     watchlist: string[],                  // Film-IDs, ohne Duplikate
//     custom: [ {id,title,year,genre,poster,description} ]  // Metadaten für Nicht-Katalog-Filme
//   }
//
// Abweichung vom 1a-Stub: `films` ist ein ID→Sterne-Map statt einer `movies`-
// Array + separater `watchlist` – das ist für den Matcher (Punkt 8) die bequemere
// Form und hält den Code kompakt. `decodeCode()` wirft bei unlesbarem Code mit
// deutscher Fehlermeldung; Form-Fehler (fremde Genres, 7 Sterne) werden nur
// defensiva bereinigt, nie werfend.

import { KNOWN_GENRES } from "./catalog.js";
import { MAX_GENRES, MAX_NAME_LENGTH } from "./profile.js";
import { MAX_STARS } from "./ratings.js";
import { normalizeCustomFilms } from "./search.js";

/** Aktuelle Code-Version; Codes mit fremder, bekannter Version verweigert decodeCode(). */
export const CODE_VERSION = 1;

/** Leere, saubere userData – Start- und Fallback-Zustand. */
export function emptyUserData() {
  return { v: CODE_VERSION, name: "", genres: [], films: {}, watchlist: [], custom: [] };
}

// --- Base64 über Bytes (portabel: Node & Browser, Unicode-sicher) ------------

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = Object.fromEntries([...B64_ALPHABET].map((c, i) => [c, i]));

/** Bytes → Base64-String (mit Padding). Eingabe: Byte-Array/Uint8Array. */
export function bytesToBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += hasB1 ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += hasB2 ? B64_ALPHABET[b2 & 63] : "=";
  }
  return out;
}

/**
 * Base64-String → Bytes; tolerant gegenüber whitespace (gekoppte Codes aus
 * Chatfenstern), sonst strikt. Liefert `null` statt zu werfen – decodeCode()
 * übersetzt das in eine saubere Fehlermeldung.
 */
export function base64ToBytes(text) {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, "");
  if (clean.length === 0 || clean.length % 4 !== 0) return null;
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const c of clean) {
    if (c === "=") continue; // Padding: trägt keine Bits (Ende der Gruppe)
    const val = B64_LOOKUP[c];
    if (val === undefined) return null; // ungültiges Zeichen
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

// --- Normalisierung ----------------------------------------------------------

/** Sterne-Value normalisieren: Integer 1..MAX_STARS, sonst `null` (unbewertet). */
function toCodeStars(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > MAX_STARS) return null;
  return n;
}

/**
 * Defensiv normalisieren (wirft nie): fremde/ungeprüfte Daten werden auf die
 * kanonische userData-Form bereinigt – nur bekannte Genres (max. MAX_GENRES),
 * Sterne 1..MAX_STARS, saubere ID-Strings, Custom-Filme via normalizeCustomFilms.
 */
export function normalizeUserData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyUserData();
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const genres = [];
  if (Array.isArray(raw.genres)) {
    for (const g of raw.genres) {
      if (typeof g === "string" && KNOWN_GENRES.includes(g) && !genres.includes(g)) genres.push(g);
      if (genres.length >= MAX_GENRES) break;
    }
  }
  const films = {};
  const src = raw.films && typeof raw.films === "object" && !Array.isArray(raw.films) ? raw.films : {};
  for (const [id, stars] of Object.entries(src)) {
    const key = typeof id === "string" ? id.trim() : "";
    const s = toCodeStars(stars);
    if (key && s !== null) films[key] = s;
  }
  const watchlist = [];
  if (Array.isArray(raw.watchlist)) {
    for (const id of raw.watchlist) {
      const key = typeof id === "string" ? id.trim() : "";
      if (key && !watchlist.includes(key)) watchlist.push(key);
    }
  }
  return { v: CODE_VERSION, name, genres, films, watchlist, custom: normalizeCustomFilms(raw.custom) };
}

/**
 * Baut die Code-Daten aus den drei App-Zuständen (Punkt 7b nutzt das für
 * "Meinen Code kopieren"): Profil (name/genres), Bewertungen (films/watchlist)
 * und Custom-Filme (deren Metadaten, damit der Empfänger sie ohne iTunes
 * nachladen kann). Fehlt ein Teil, bleibt der Code einfach schlanker.
 */
export function buildUserData({ profile, ratings, customFilms } = {}) {
  const films = {};
  const watchlist = [];
  const entries = ratings && typeof ratings.films === "object" && ratings.films !== null ? Object.entries(ratings.films) : [];
  for (const [id, entry] of entries) {
    const key = typeof id === "string" ? id.trim() : "";
    if (!key) continue;
    const s = toCodeStars(entry?.stars);
    if (s !== null) films[key] = s;
    if (entry?.watchlist === true && !watchlist.includes(key)) watchlist.push(key);
  }
  return {
    v: CODE_VERSION,
    name: normalizeUserData(profile).name,
    genres: normalizeUserData(profile).genres,
    films,
    watchlist,
    custom: normalizeCustomFilms(customFilms),
  };
}

// --- Encode / Decode ---------------------------------------------------------

/**
 * Kodiert userData (oder eine rohere Form) zu einem teilbaren Base64-Code.
 * Normalisiert defensiva, wirft nie – eigene Zustände sind immer kodierbar.
 */
export function encodeCode(data) {
  const json = JSON.stringify(normalizeUserData(data));
  return bytesToBase64(new TextEncoder().encode(json));
}

/**
 * Dekodiert einen eingefügten Code (tolerant gegenüber whitespace).
 * Wirft bei unlesbarem Code oder fremder Code-Version mit deutscher Meldung;
 * Form-Fehler darin werden defensiva bereinigt.
 */
export function decodeCode(code) {
  const bytes = base64ToBytes(typeof code === "string" ? code.trim() : "");
  if (!bytes) {
    throw new Error("Das sieht nicht nach einem gültigen CineMatch-Code aus.");
  }
  let json;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Der Code ist beschädigt und konnte nicht gelesen werden.");
  }
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Der Code ist beschädigt und konnte nicht gelesen werden.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Der Code enthält keine gültigen Daten.");
  }
  if (raw.v !== undefined && raw.v !== CODE_VERSION) {
    throw new Error(`Dieser Code nutzt eine neue Version (v${raw.v}) – bitte CineMatch aktualisieren.`);
  }
  return normalizeUserData(raw);
}

// --- Demo-Freund (Plan-Punkt 7: vorgefertigter Test-Code) --------------------
// Referenziert nur Katalog-IDs → der Empfänger kennt Titel/Jahr/Genre ohne
// iTunes-Nachladen; Genres + Bewertungen sind so gewählt, dass Punkt 8/9
// ein aussagekräftiges, buntes Dashboard ergeben.

/** Profil des Demo-Freunds (immer verfügbar, auch offline). */
export function demoFriendData() {
  return {
    v: CODE_VERSION,
    name: "Lena",
    genres: ["Sci-Fi", "Drama", "Thriller"],
    films: {
      "inception-2010": 5,
      "interstellar-2014": 4,
      "the-matrix-1999": 5,
      "oppenheimer-2023": 4,
      "the-shawshank-redemption-1994": 5,
      "parasite-2019": 4,
      "the-silence-of-the-lambs-1991": 5,
      "dune-2021": 3,
    },
    watchlist: ["gravity-2013"],
    custom: [],
  };
}

/** Der vorgefertigte Share-Code des Demo-Freunds – deterministisch (gleiche Daten → gleicher Code). */
export function demoFriendCode() {
  return encodeCode(demoFriendData());
}
