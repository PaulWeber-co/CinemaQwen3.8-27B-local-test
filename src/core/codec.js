// CineMatch – Codec
// Verwaltet den Share-Code: kompaktes JSON <-> Base64-String.
// DOM-frei, damit das Modul unter Node testbar ist (siehe test/run-tests.mjs).
// Aktuell Stub (Punkt 1a) – die Implementierung folgt mit Punkt 7.

/**
 * Kodiert ein Benutzer-Datenobjekt zu einem teilbaren Share-Code (Base64).
 * @param {{name: string, genres: string[], movies: Array, watchlist: Array}} data
 * @returns {string} Base64-kodierter Share-Code
 */
export function encodeCode(data) {
  throw new Error("encodeCode() ist noch nicht implementiert (siehe Plan-Punkt 7).");
}

/**
 * Dekodiert einen Share-Code (Base64) zurück in das Benutzer-Datenobjekt.
 * @param {string} code
 * @returns {{name: string, genres: string[], movies: Array, watchlist: Array}}
 */
export function decodeCode(code) {
  throw new Error("decodeCode() ist noch nicht implementiert (siehe Plan-Punkt 7).");
}
