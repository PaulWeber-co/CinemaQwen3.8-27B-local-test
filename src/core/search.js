// CineMatch – Such- und Custom-Film-Helfer (Plan-Punkt 6a)
// iTunes-Livesuche: Treffer in die Bewertungsliste aufnehmen, ohne Duplikate,
// und die selbst hinzugefügten Filme (Custom-Filme) persistieren.
//
// DOM-frei, damit das Modul unter Node testbar ist (siehe test/run-tests.mjs).
// localStorage ist injizierbar wie bei profile.js/ratings.js; ein explizites
// `null` deaktiviert die Persistenz (Offline-Modus, saubere Tests).
//
// Wozu: Der Katalog (Punkt 2) ist eine feste Start-Bestenliste. Per Livesuche
// (Punkt 6) ergänzt der Nutzer beliebige weitere Filme – diese "Custom-Filme"
// brauchen (a) Duplikat-Schutz gegen Katalog + bereits Zugelassene und
// (b) ihre eigene Persistenz, sonst wären nach dem Neuladen die Bewertungen
// zu ihnen (ratings.js, Schlüssel = film.id) verwaiste Einträge.

/** Storage-Key für Custom-Filme (versioniert → spätere Migration möglich). */
export const CUSTOM_FILMS_STORAGE_KEY = "cinematch.custom-films.v1";

/** Obergrenze für Custom-Filme – schützt localStorage vor ungebändigtem Wachsen. */
export const MAX_CUSTOM_FILMS = 100;

/**
 * Normalisiert einen rohen Custom-Film (z. B. iTunes-Suchtreffer) auf die
 * Felder, die die UI braucht (id/title nötig, alles andere optional).
 * @returns {{id: string, title: string, year: number|null, genre: string|null,
 *            term: string, poster: string|null, description: string|null}|null}
 */
export function normalizeCustomFilm(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : null;
  if (!id || !title) return null;
  const year = Number.isInteger(raw.year) && raw.year > 0 ? raw.year : null;
  const genre = typeof raw.genre === "string" && raw.genre.trim() ? raw.genre.trim().slice(0, 40) : null;
  const poster = typeof raw.poster === "string" && raw.poster ? raw.poster : null;
  const description =
    typeof raw.description === "string" && raw.description.trim() ? raw.description.trim().slice(0, 2000) : null;
  const term =
    typeof raw.term === "string" && raw.term.trim()
      ? raw.term.trim()
      : `${title}${year ? ` ${year}` : ""}`;
  return { id, title, year, genre, term, poster, description };
}

/**
 * Defensiv normalisieren (für geladene Daten): nur gültige Einträge, ohne
 * doppelte IDs, max. MAX_CUSTOM_FILMS (neuere jenseits der Grenze verwerfen).
 */
export function normalizeCustomFilms(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const film = normalizeCustomFilm(entry);
    if (!film || seen.has(film.id)) continue;
    seen.add(film.id);
    out.push(film);
    if (out.length >= MAX_CUSTOM_FILMS) break;
  }
  return out;
}

/**
 * Duplikat-Schlüssel eines Films: "titel jahr" (klein, ohne Artikel).
 * Ein Katalogfilm liefert zusätzlich einen Schlüssel aus seinem iTunes-`term`
 * (Englisch-Original) – so erkennt ein Treffer "The Dark Knight" (2008) den
 * Katalog-Eintrag "Der dunkle Ritter" (2008) als gleich. Ohne Jahr wird KEIN
 * Titel-Schlüssel erzeugt, damit zwei "Batman"-Filme unterschiedlicher
 * Jahrgänge nie versehentlich zusammenfallen.
 */
export function dedupeKeys(film) {
  const keys = new Set();
  const add = (label) => {
    if (typeof label !== "string") return;
    let t = label.trim().toLowerCase();
    if (!t) return;
    t = t.replace(/\s+\d{4}$/, ""); // "… 2008" am Ende: Jahr gehört in den Year-Slot
    if (!t) return;
    // Artikel bleiben stehen: "Die Hard" ≠ "Hard" (Fehl-Dedupe-Risiko), und für
    // die DE↔EN-Erkennung hilft die `term`-Variante (Englisch-Original) sowieso.
    if (Number.isFinite(film?.year)) t = `${t} ${film.year}`;
    keys.add(t);
  };
  add(film?.title);
  add(film?.term);
  return keys;
}

/**
 * Fügt neue Suchtreffer an die Filmliste an (ohne Mutation der Eingaben).
 * Ein Treffer gilt als Duplikat, wenn seine ID ODER einer seiner Duplikat-
 * Schlüssel (s. dedupeKeys) bereits vorkommt – auch unter den neu
 * zugefügten Treffern derselben Charge (z. B. zwei Auflagen desselben Films).
 * @param {object[]} films bisherige Liste (z. B. Katalog + Custom-Filme)
 * @param {object[]} hits Suchtreffer (normalisiert, z. B. von itunes.search)
 * @returns {{ films: object[], added: object[] }} erweiterte Liste + nur die Neuen
 */
export function mergeSearchHits(films, hits) {
  const base = Array.isArray(films) ? [...films] : [];
  const ids = new Set(base.map((f) => f?.id).filter(Boolean));
  const keys = new Set();
  for (const f of base) for (const k of dedupeKeys(f)) keys.add(k);

  const added = [];
  for (const hit of Array.isArray(hits) ? hits : []) {
    const film = normalizeCustomFilm(hit);
    if (!film) continue; // unvollständig (keine id/title) → überspringen
    if (ids.has(film.id)) continue;
    const hitKeys = dedupeKeys(film);
    let isDuplicate = false;
    for (const k of hitKeys) {
      if (keys.has(k)) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;
    ids.add(film.id);
    for (const k of hitKeys) keys.add(k);
    added.push(film);
  }
  return { films: [...base, ...added], added };
}

function resolveStorage(storage) {
  if (storage === null) return null; // explizite Persistenz-Ausschaltung
  return storage ?? (globalThis.localStorage ?? null);
}

/** Custom-Filme in den Storage schreiben. Liefert false, wenn es nicht geht. */
export function saveCustomFilms(storage, films) {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    s.setItem(CUSTOM_FILMS_STORAGE_KEY, JSON.stringify(normalizeCustomFilms(films)));
    return true;
  } catch {
    return false;
  }
}

/** Custom-Filme laden; bei fehlendem/kaputtem Datensatz leere Liste. Wirft nie. */
export function loadCustomFilms(storage) {
  const s = resolveStorage(storage);
  if (!s) return [];
  try {
    const raw = s.getItem(CUSTOM_FILMS_STORAGE_KEY);
    if (!raw) return [];
    return normalizeCustomFilms(JSON.parse(raw));
  } catch {
    return [];
  }
}
