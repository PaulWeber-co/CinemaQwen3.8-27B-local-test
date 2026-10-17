# Plan
Ziel: CineMatch als statische SPA (HTML + Tailwind-CDN + Vanilla JS) bauen: 3 Schritte (Name+Genres, Film-Bewertungen, Share-Code), iTunes-API für Cover/Texte, Matching-Dashboard mit Gauge, Autosave in localStorage, Dev-Server.
Prüfbefehl: node test/run-tests.mjs
Annahmen: Keine npm-Abhängigkeiten – Tailwind via CDN, Vanilla JS als ES-Module; reine Kern-Module (Codec, Matcher, Katalog) sind DOM-frei und damit Node-testbar. iTunes-API kann nachts ggf. nicht erreichbar sein → Fallback-Platzhalter-Cover + lokale Titel/Jahre. Dev-Server = statischer Server im Hintergrund; Start-Kommando wird in README.md dokumentiert.

## Punkte
- [x] 1. Grundgerüst: `index.html` mit Tailwind-CDN, Dark-Theme (Anthrazit, Neon-Violett/Gold, Glasmorphismus), App-Shell mit 3 Schritten; `src/core/`-Ordner mit leerem, testfähigem `codec.js`/`matcher.js`; `test/run-tests.mjs` (1 Smoke-Assert) – Prüfbefehl läuft grün, Seite öffnet im Browser.
  - [x] 1a. Kern-Module + Test-Runner: `src/core/codec.js` (encodeCode/decodeCode) und `src/core/matcher.js` (computeMatch) als DOM-freie, Node-testbare Stubs; `test/run-tests.mjs` (minimaler Runner, 1 Smoke-Assert) – `node test/run-tests.mjs` läuft grün.
  - [x] 1b. `index.html` mit Tailwind-CDN, Dark-Theme (Anthrazit, Neon-Violett/Gold, Glasmorphismus), App-Shell mit 3 Schritten – Seite öffnet im Browser.
- [x] 2. Kuratierte Start-Bestenliste: `src/core/catalog.js` mit ~35 Kult-/Blockbuster-Filmen (Titel, Jahr, Genre, iTunes-`term`), unit-getestet.
- [x] 3. iTunes-API-Client: `src/core/itunes.js` holt Cover (hiRes) + deutsche Beschreibung, in-memory + localStorage-Cache, sauberes Fallback-Verhalten bei Fehlern/Offline; Unit-Tests mit gefaktem fetch.
- [x] 4. Schritt-1-UI: Namen-Eingabe + 10 Genre-Pills (max. 5, Toggle), automatischer localStorage-Save/Restore; Seite bleibt lauffähig.
- [x] 5. Schritt-2-UI: Film-Grid mit Poster, Titel, Jahr; 1–5 Sterne (setzt "gesehen"), Watchlist-Button, Reset auf "unberührt", Klappentext-Modal; alles in localStorage persistiert.
  - [x] 5a. `src/core/ratings.js` (DOM-frei, Node-testbar): Bewertungs-Zustand pro Film (stars 0–5, 0 = unberührt; watchlist), setStars/toggleWatchlist/resetFilm, save/load mit injizierbarem Storage, defensive normalize; Unit-Tests.
  - [x] 5b. `src/ui/step2.js`: Film-Grid mit Poster (itunes.js, Fallback), Titel, Jahr; 1–5-Sterne-Widget, Watchlist-Button, Reset, Klappentext-Modal; Auto-Save in localStorage; index.html Schritt-2-Sektion ersetzt.
- [ ] 6. Live-Suchleiste: iTunes-Livesuche (Debounce, Ergebnis-Dropdown), Treffer per Klick in die Bewertungsliste aufnehmen.
- [ ] 7. Schritt 3: "Meinen Code kopieren" (kompaktes JSON → Base64 → Zwischenablage) + Einfügefeld + "Match berechnen!" (Validierung, Fehlermeldung); "Demo-Freund laden"-Button mit vorgefertigtem Test-Code.
- [ ] 8. Matching-Algorithmus: `matcher.js` rechnet Gesamt-Score (70% nur gemeinsam gesehen & bewertet, Formel `100 − |ΔSterne|/4·100`; 30% Genre-Overlap) plus die drei Listen (Seelenverwandt, Größte Unterschiede, Gemeinsamer Filmabend); vollständige Unit-Tests inkl. Edge Cases (keine gemeinsamen Filme, keine Genres).
- [ ] 9. Dashboard-UI: animierter Prozent-Gauge, Karten mit Postern für alle vier Sektionen, sauberer Empty-State bei ungenügenden Daten.
- [ ] 10. Feinschliff: Hover-/Fade-Animationen, responsives Layout (Mobile), Fehler- und Offline-Hinweise, README.md mit Start-Anleitung.
- [ ] 11. Gesamtprüfung: Prüfbefehl ausführen und Fehler beheben; statischen Dev-Server im Hintergrund starten (python3 -m http.server), Erreichbarkeit per HTTP-Check verifizieren, Start-Kommando + Port in README und LOG dokumentieren.
