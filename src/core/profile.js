// CineMatch – Profil-Zustand (Plan-Punkt 4)
// Schritt 1: Name + bis zu 5 Lieblingsgenres.
// DOM-frei, damit das Modul unter Node testbar ist (siehe test/run-tests.mjs).
// localStorage ist injizierbar; im Browser übergibt die UI globalThis.localStorage,
// ein explizites `null` deaktiviert die Persistenz (Offline-Modus, saubere Tests).

import { KNOWN_GENRES } from "./catalog.js";

/** Storage-Key fürs Profil (versioniert → alte Daten lassen sich später migrieren). */
export const PROFILE_STORAGE_KEY = "cinematch.profile.v1";

/** Maximal auswählbare Genres (Plan-Punkt 4). */
export const MAX_GENRES = 5;

/** Namenslänge-Obergrenze (Annahme Punkt 4: hält den Share-Code kompakt). */
export const MAX_NAME_LENGTH = 40;

/** Leeres Profil – der sichere Start- und Fallback-Zustand. */
export function emptyProfile() {
  return { name: "", genres: [] };
}

/** Name: trimmen und bei MAX_NAME_LENGTH abschneiden. Nicht-Strings → "". */
export function normalizeName(name) {
  if (typeof name !== "string") return "";
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Defensiv normalisieren (für geladene/externe Daten, z. B. aus fremden Codes):
 * Name → String; Genres → nur bekannte, ohne Duplikate, max. MAX_GENRES.
 */
export function normalizeProfile(raw) {
  if (!raw || typeof raw !== "object") return emptyProfile();
  const name = normalizeName(raw.name);
  const genres = [];
  if (Array.isArray(raw.genres)) {
    for (const g of raw.genres) {
      if (KNOWN_GENRES.includes(g) && !genres.includes(g)) genres.push(g);
      if (genres.length >= MAX_GENRES) break;
    }
  }
  return { name, genres };
}

/**
 * Genre an-/abschalten. Liefert immer ein neues Profil (keine Mutation).
 * `atLimit` = true, wenn das Limit (MAX_GENRES) der Aufnahme im Weg stand →
 * die UI kann kurz einen Hinweis anzeigen; das Profil bleibt dann unverändert.
 */
export function toggleGenre(profile, genre) {
  const p = normalizeProfile(profile);
  if (!KNOWN_GENRES.includes(genre)) return { profile: p, atLimit: false };
  if (p.genres.includes(genre)) {
    return { profile: { ...p, genres: p.genres.filter((g) => g !== genre) }, atLimit: false };
  }
  if (p.genres.length >= MAX_GENRES) return { profile: p, atLimit: true };
  return { profile: { ...p, genres: [...p.genres, genre] }, atLimit: false };
}

function resolveStorage(storage) {
  if (storage === null) return null; // explizite Persistenz-Ausschaltung
  return storage ?? (globalThis.localStorage ?? null);
}

/** Profil in den Storage schreiben. Liefert false, wenn es nicht geht. */
export function saveProfile(storage, profile) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    s.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalizeProfile(profile)));
    return true;
  } catch {
    return false;
  }
}

/** Profil laden; bei fehlendem/kaputtem Datensatz leeres Profil. Wirft nie. */
export function loadProfile(storage) {
  const s = resolveStorage(storage);
  if (!s) return emptyProfile();
  try {
    const raw = s.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return emptyProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return emptyProfile();
  }
}
