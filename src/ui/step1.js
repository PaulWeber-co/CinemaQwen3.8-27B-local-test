// CineMatch – Schritt-1-UI (Plan-Punkt 4)
// Namen-Eingabe + 10 Genre-Pills (max. 5), automatischer localStorage-Save/Restore.
// Die Logik lebt in src/core/profile.js (DOM-frei); diese Datei bedient nur das DOM.

import { KNOWN_GENRES } from "../core/catalog.js";
import { MAX_GENRES, loadProfile, saveProfile, toggleGenre } from "../core/profile.js";

const LIMIT_HINT_MS = 2000;

export function initStep1() {
  const nameInput = document.getElementById("profile-name");
  const pillsBox = document.getElementById("genre-pills");
  const counter = document.getElementById("genre-count");
  const hint = document.getElementById("genre-limit-hint");
  if (!nameInput || !pillsBox) return; // Schritt-1-Sektion fehlt → App läuft weiter

  const storage = globalThis.localStorage ?? null; // null → Persistenz still

  let profile = loadProfile(storage);
  let hintTimer = null;

  nameInput.value = profile.name;

  function flashLimitHint() {
    if (!hint) return;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.hidden = true; }, LIMIT_HINT_MS);
  }

  function persist() {
    saveProfile(storage, profile);
  }

  function render() {
    if (counter) {
      counter.textContent = `${profile.genres.length} / ${MAX_GENRES}`;
      counter.classList.toggle("genre-count--limit", profile.genres.length >= MAX_GENRES);
    }
    pillsBox.replaceChildren(...KNOWN_GENRES.map((genre) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "genre-pill";
      btn.textContent = genre;
      btn.setAttribute("aria-pressed", String(profile.genres.includes(genre)));
      btn.addEventListener("click", () => {
        const result = toggleGenre(profile, genre);
        if (result.atLimit) {
          flashLimitHint(); // Limit erreicht → Profil bleibt unverändert
          return;
        }
        profile = result.profile;
        persist();
        render();
      });
      return btn;
    }));
  }

  nameInput.addEventListener("input", () => {
    profile = { ...profile, name: nameInput.value };
    persist(); // automatischer Save bei jeder Eingabe
  });

  render();
}
