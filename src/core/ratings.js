// CineMatch – Bewertungs-Zustand (Plan-Punkt 5a)
// Schritt 2: pro Film Sterne (0 = unberührt, 1–5 = gesehen & bewertet) + Watchlist.
// DOM-frei, damit das Modul unter Node testbar ist (siehe test/run-tests.mjs).
// localStorage ist injizierbar; im Browser übergibt die UI globalThis.localStorage,
// ein explizites `null` deaktiviert die Persistenz (Offline-Modus, saubere Tests).

/** Storage-Key für die Bewertungen (versioniert → spätere Migration möglich). */
export const RATINGS_STORAGE_KEY = "cinematch.ratings.v1";

/** Maximal gültige Sternehöhe (Plan: 1–5 Sterne). */
export const MAX_STARS = 5;

/**
 * Zustand-Form: { films: { [filmId]: { stars: 0..5, watchlist: bool } } }.
 * `stars: 0` bedeutet "unberührt" (nie gesehen / Bewertung gelöscht).
 * Leer-Einträge (stars 0 UND watchlist false) werden weggelassen,
 * damit der spätere Share-Code (Punkt 7) klein bleibt.
 */
export function emptyRatings() {
  return { films: {} };
}

/**
 * Defensiv normalisieren (für geladene/externe Daten, z. B. aus fremden Codes):
 * Nicht-Objekt → leer. Pro Eintrag: stars → Integer 0..MAX_STARS (sonst 0),
 * watchlist → Boolean. Ungültige/leere IDs werden verworfen.
 */
export function normalizeRatings(raw) {
  if (!raw || typeof raw !== "object") return emptyRatings();
  const films = {};
  const src = raw.films && typeof raw.films === "object" ? raw.films : {};
  for (const [id, entry] of Object.entries(src)) {
    if (typeof id !== "string" || id.length === 0) continue;
    const stars = toStars(entry?.stars);
    const watchlist = entry?.watchlist === true;
    if (stars > 0 || watchlist) films[id] = { stars, watchlist };
  }
  return { films };
}

/** Sterne normalisieren: nur Integer 0..MAX_STARS, alles andere → 0. */
function toStars(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_STARS, Math.max(0, n));
}

/**
 * Sterne für einen Film setzen (0 = zurück auf "unberührt").
 * Liefert immer ein neues Objekt (keine Mutation). Unbekannte IDs erlaubt –
 * die UI kennt die Katalog-IDs, das Kern-Modul bleibt generalisiert (Punkt 6).
 */
export function setStars(ratings, filmId, stars) {
  const r = normalizeRatings(ratings);
  const current = r.films[filmId] ?? { stars: 0, watchlist: false };
  return upsert(r, filmId, { ...current, stars: toStars(stars) });
}

/**
 * Watchlist an-/abhacken. Ein reiner Watchlist-Eintrag (stars 0) ist erlaubt:
 * "zum Später-Regeln-Merken", ohne dass der Film als gesehen gilt.
 */
export function toggleWatchlist(ratings, filmId) {
  const r = normalizeRatings(ratings);
  const current = r.films[filmId] ?? { stars: 0, watchlist: false };
  return upsert(r, filmId, { ...current, watchlist: !current.watchlist });
}

/**
 * Film zurücksetzen auf "unberührt" (Plan-Punkt 5: Reset-Button):
 * Sterne → 0, Watchlist → false (Annahme: Reset räumt beides auf).
 */
export function resetFilm(ratings, filmId) {
  const r = normalizeRatings(ratings);
  return upsert(r, filmId, { stars: 0, watchlist: false });
}

/** Eintrag schreiben; leerer Zustand (stars 0 + watchlist false) wird entfernt. */
function upsert(ratings, filmId, entry) {
  if (typeof filmId !== "string" || filmId.length === 0) return ratings;
  const films = { ...ratings.films };
  if (entry.stars > 0 || entry.watchlist) {
    films[filmId] = entry;
  } else {
    delete films[filmId];
  }
  return { films };
}

/** Anzahl Filme mit >= 1 Stern – nützlich für Punkte 7–9 (Fortschritt, Empty-States). */
export function watchedCount(ratings) {
  const r = normalizeRatings(ratings);
  let n = 0;
  for (const entry of Object.values(r.films)) {
    if (entry.stars > 0) n++;
  }
  return n;
}

function resolveStorage(storage) {
  if (storage === null) return null; // explizite Persistenz-Ausschaltung
  return storage ?? (globalThis.localStorage ?? null);
}

/** Bewertungen in den Storage schreiben. Liefert false, wenn es nicht geht. */
export function saveRatings(storage, ratings) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    s.setItem(RATINGS_STORAGE_KEY, JSON.stringify(normalizeRatings(ratings)));
    return true;
  } catch {
    return false;
  }
}

/** Bewertungen laden; bei fehlendem/kaputtem Datensatz leeres Objekt. Wirft nie. */
export function loadRatings(storage) {
  const s = resolveStorage(storage);
  if (!s) return emptyRatings();
  try {
    const raw = s.getItem(RATINGS_STORAGE_KEY);
    if (!raw) return emptyRatings();
    return normalizeRatings(JSON.parse(raw));
  } catch {
    return emptyRatings();
  }
}
