// CineMatch – Matcher
// Berechnet das Filmgeschmack-Match zwischen zwei Personen:
// Gesamt-Score (70% gemeinsame Film-Bewertungen, 30% Genre-Overlap)
// plus die vier Dashboard-Sektionen (Seelenverwandt, Größte Unterschiede,
// Gemeinsamer Filmabend, …).
// DOM-frei, damit das Modul unter Node testbar ist (siehe test/run-tests.mjs).
// Aktuell Stub (Punkt 1a) – die Implementierung folgt mit Punkt 8.

/**
 * Berechnet das vollständige Match zwischen zwei Benutzer-Datenobjekten.
 * @param {{name: string, genres: string[], movies: Array, watchlist: Array}} userA
 * @param {{name: string, genres: string[], movies: Array, watchlist: Array}} userB
 * @returns {{score: number, soulmates: Array, differences: Array, movieNight: Array}}
 */
export function computeMatch(userA, userB) {
  throw new Error("computeMatch() ist noch nicht implementiert (siehe Plan-Punkt 8).");
}
