// CineMatch – Schritt-2-UI (Plan-Punkt 5b)
// Film-Grid mit Postern (iTunes hiRes, offline → SVG-Platzhalter), 1–5 Sterne,
// Watchlist, Reset und Klappentext-Modal; Auto-Save über core/ratings.js.
//
// Die Logik (Zustand, Save/Load) lebt in src/core/ratings.js (DOM-frei, getestet);
// diese Datei bedient nur das DOM. initStep2() ist idempotent – app.js ruft sie
// beim ersten Betritt von Schritt 2 auf (lazy, damit beim Seitenaufruf nicht
// sofort 35 iTunes-Anfragen fliegen).

import { catalog } from "../core/catalog.js";
import { ituns as defaultItuns } from "../core/itunes.js";
import {
  MAX_STARS,
  loadRatings,
  saveRatings,
  setStars,
  toggleWatchlist,
  resetFilm,
  watchedCount,
} from "../core/ratings.js";

/** Höchste gleichzeitige iTunes-Abfragen (Browser limitiert sowoit auf ~6/Host). */
const LOOKUP_CONCURRENCY = 5;

const ARTICLES = new Set(["der", "die", "das"]);

/**
 * Deterministische Farbvariante für den Offline-Platzhalter (0..359):
 * einfacher String-Hash über die Film-ID – gleiche ID → gleiche Farbe.
 */
export function posterHue(id) {
  let h = 0;
  const s = String(id ?? "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/**
 * Offline-Platzhalter-Poster als SVG-Data-URI (vernetzungslos):
 * Farbverlauf aus posterHue() + Initialen des Titels + Jahr.
 * Artikel (Der/Die/Das) zählen nicht in die Initialen ein ("Der dunkle Ritter" → DR).
 */
export function fallbackPoster(film) {
  const hue = posterHue(film.id);
  let initials = "";
  for (const word of String(film.title ?? "").split(/\s+/).filter(Boolean)) {
    if (initials.length >= 2) break;
    if (ARTICLES.has(word.toLowerCase())) continue;
    initials += word[0].toUpperCase();
  }
  if (!initials) initials = "??";
  const year = Number.isFinite(film.year) ? String(film.year) : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},45%,26%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,12%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="300" height="450" fill="url(#g)"/>` +
    `<text x="150" y="225" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="Inter,system-ui,sans-serif" font-size="96" font-weight="700" fill="rgba(255,255,255,0.85)">${initials}</text>` +
    `<text x="150" y="330" text-anchor="middle" ` +
    `font-family="Inter,system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.5)">${year}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

let initialized = false;

/**
 * Baut das Film-Grid auf (idempotent).
 * @param {{ films?: object[], ituns?: object, storage?: object|null }} [options]
 *   Alle drei sind für Tests/Offline injizierbar; Standards: Katalog, ituns-Singleton, Browser-Storage.
 */
export function initStep2(options = {}) {
  if (initialized) return; // zweiter Aufruf (Navigation) bleibt no-op
  const grid = document.getElementById("film-grid");
  if (!grid) return; // Schritt-2-Sektion fehlt → App läuft weiter
  initialized = true;

  const films = options.films ?? catalog;
  const ituns = options.ituns ?? defaultItuns;
  const storage = options.storage ?? globalThis.localStorage ?? null;

  const progressEl = document.getElementById("ratings-progress");

  let ratings = loadRatings(storage);
  const info = Object.create(null); // filmId → letztes iTunes-Ergebnis (fürs Modal)
  const cards = new Map(); // filmId → { img, starBtns, watchBtn, resetBtn }

  function persist() {
    saveRatings(storage, ratings); // wirft nie (Kern-Modul)
  }

  function updateProgress() {
    if (progressEl) {
      progressEl.textContent = `Gesehen: ${watchedCount(ratings)} von ${films.length}`;
    }
  }

  function renderCard(film) {
    const card = cards.get(film.id);
    if (!card) return;
    const entry = ratings.films[film.id] ?? { stars: 0, watchlist: false };
    card.starBtns.forEach((btn, i) => {
      btn.classList.toggle("star-btn--on", i < entry.stars);
      btn.setAttribute("aria-pressed", String(i + 1 === entry.stars));
    });
    card.watchBtn.classList.toggle("film-icon-btn--on", entry.watchlist);
    card.watchBtn.setAttribute("aria-pressed", String(entry.watchlist));
  }

  // --- Modal (Klappentext) ---------------------------------------------------

  const modal = document.getElementById("film-modal");
  const modalTitle = document.getElementById("film-modal-title");
  const modalMeta = document.getElementById("film-modal-meta");
  const modalPoster = document.getElementById("film-modal-poster");
  const modalDesc = document.getElementById("film-modal-description");
  const modalClose = document.getElementById("film-modal-close");
  const modalBackdrop = document.getElementById("film-modal-backdrop");
  let lastFocused = null;

  function onEsc(e) {
    if (e.key === "Escape") closeModal();
  }

  function closeModal() {
    if (!modal || modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");
    document.removeEventListener("keydown", onEsc);
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  function openModal(film) {
    if (!modal) return;
    const it = info[film.id];
    if (modalTitle) modalTitle.textContent = film.title;
    if (modalMeta) modalMeta.textContent = `${film.year} · ${film.genre}`;
    if (modalPoster) modalPoster.src = (it && it.poster) || fallbackPoster(film);
    if (modalDesc) {
      modalDesc.textContent =
        it && it.description
          ? it.description
          : "Kein Klappentext verfügbar (vermutlich offline) – lokal bekannt: " +
            `${film.title} (${film.year}), ${film.genre}.`;
    }
    lastFocused = document.activeElement;
    modal.classList.remove("hidden");
    modalClose?.focus();
    document.addEventListener("keydown", onEsc);
  }

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);

  // --- Karten ----------------------------------------------------------------

  function buildCard(film) {
    const el = document.createElement("article");
    el.className = "film-card";
    el.dataset.filmId = film.id;

    const posterBtn = document.createElement("button");
    posterBtn.type = "button";
    posterBtn.className = "film-card-poster";
    posterBtn.setAttribute("aria-label", `Klappentext: ${film.title} (${film.year})`);
    const img = document.createElement("img");
    img.className = "film-card-poster-img";
    img.alt = film.title;
    img.loading = "lazy";
    img.src = fallbackPoster(film); // sofort sichtbar; iTunes-Ergebnis ersetzt es
    img.addEventListener("error", () => {
      // kaputte hiRes-URL → zurück auf Platzhalter (max. ein Mal pro Src)
      if (img.dataset.fb) return;
      img.dataset.fb = "1";
      img.src = fallbackPoster(film);
    });
    posterBtn.appendChild(img);
    el.appendChild(posterBtn);

    const body = document.createElement("div");
    body.className = "film-card-body";

    const title = document.createElement("h3");
    title.className = "film-card-title";
    title.textContent = film.title;
    title.title = film.title;
    const year = document.createElement("p");
    year.className = "film-card-year";
    year.textContent = String(film.year);
    body.append(title, year);

    const stars = document.createElement("div");
    stars.className = "star-widget";
    stars.setAttribute("role", "group");
    stars.setAttribute("aria-label", `${film.title} bewerten`);
    const starBtns = [];
    for (let n = 1; n <= MAX_STARS; n++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "star-btn";
      b.textContent = "★";
      b.setAttribute("aria-label", `${n} von ${MAX_STARS} Sternen`);
      b.addEventListener("click", (e) => {
        e.stopPropagation(); // nicht ins Modal durchreichen
        const current = ratings.films[film.id]?.stars ?? 0;
        ratings = setStars(ratings, film.id, n === current ? 0 : n); // erneuter Klick = 0
        persist();
        renderCard(film);
        updateProgress();
      });
      starBtns.push(b);
      stars.appendChild(b);
    }
    body.appendChild(stars);

    const row = document.createElement("div");
    row.className = "film-card-actions";

    const watchBtn = document.createElement("button");
    watchBtn.type = "button";
    watchBtn.className = "film-icon-btn";
    watchBtn.textContent = "🔖";
    watchBtn.setAttribute("aria-label", `${film.title} in Watchlist`);
    watchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ratings = toggleWatchlist(ratings, film.id);
      persist();
      renderCard(film);
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "film-icon-btn";
    resetBtn.textContent = "↺";
    resetBtn.setAttribute("aria-label", `${film.title} zurücksetzen`);
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ratings = resetFilm(ratings, film.id);
      persist();
      renderCard(film);
      updateProgress();
    });

    row.append(watchBtn, resetBtn);
    body.appendChild(row);
    el.appendChild(body);

    el.addEventListener("click", () => openModal(film)); // Karte/Poster → Klappentext

    return { el, img, starBtns, watchBtn, resetBtn };
  }

  for (const film of films) {
    const card = buildCard(film);
    cards.set(film.id, card);
    grid.appendChild(card.el);
  }

  // Posters nachladen (begrenzte Parallelität; ituns.lookup wirft nie,
  // der try/catch ist doppelter Boden für injizierte Test-Clients).
  const queue = [...films];
  async function worker() {
    while (queue.length > 0) {
      const film = queue.shift();
      let result;
      try {
        result = await ituns.lookup(film.term);
      } catch {
        result = null;
      }
      info[film.id] = result ?? { poster: null, description: null, source: "fallback" };
      if (result?.poster) {
        const img = cards.get(film.id)?.img;
        if (img) {
          delete img.dataset.fb; // neues Src → Fehler-Fallback darf erneut greifen
          img.src = result.poster;
        }
      }
    }
  }
  for (let i = 0; i < Math.min(LOOKUP_CONCURRENCY, films.length); i++) void worker();

  for (const film of films) renderCard(film); // gespeicherte Zustände anzeigen
  updateProgress();
}
