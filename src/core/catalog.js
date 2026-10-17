// CineMatch – Kuratierte Start-Bestenliste (Plan-Punkt 2)
// ~35 Kult-/Blockbuster-Filme als Ausgangskatalog für Schritt 2.
// DOM-frei, damit das Modul unter Node testbar ist (siehe test/run-tests.mjs).
//
// Felder pro Eintrag:
//   id    – stabile, sprachunabhängige Kennung (Englisch-Original + Jahr)
//           → wird in Schritt 2/8 als Matching-Schlüssel verwendet
//   title – deutscher Filmtitel (Anzeige)
//   year  – Produktionsjahr (Zahl)
//   genre – exakt eines der zehn bekannten Genres (siehe KNOWN_GENRES)
//   term  – Suchbegriff für die iTunes-API ("Titel Jahr")

/** Die zehn Genres, die die App unterstützt (Plan-Punkt 4 definiert die Pills). */
export const KNOWN_GENRES = [
  "Action",
  "Komödie",
  "Drama",
  "Sci-Fi",
  "Horror",
  "Thriller",
  "Animation",
  "Fantasy",
  "Krimi",
  "Dokumentarfilm",
];

function film(id, title, year, genre, term) {
  return { id, title, year, genre, term };
}

/** Der komplette Katalog: 35 Filme, alle zehn Genres vertreten. */
export const catalog = [
  // Action
  film("the-dark-knight-2008", "Der dunkle Ritter", 2008, "Action", "The Dark Knight 2008"),
  film("die-hard-1988", "Stirb langsam", 1988, "Action", "Die Hard 1988"),
  film("jurassic-park-1993", "Jurassic Park", 1993, "Action", "Jurassic Park 1993"),
  film("braveheart-1995", "Braveheart", 1995, "Action", "Braveheart 1995"),
  film("the-hunger-games-2012", "Die Tribute von Panem", 2012, "Action", "The Hunger Games 2012"),
  // Komödie
  film("the-grand-budapest-hotel-2014", "The Grand Budapest Hotel", 2014, "Komödie", "The Grand Budapest Hotel 2014"),
  film("ferris-buellers-day-off-1986", "Ferris bueller ist frei", 1986, "Komödie", "Ferris Bueller's Day Off 1986"),
  film("home-alone-1990", "Home Alone – Heim allein zu Haus", 1990, "Komödie", "Home Alone 1990"),
  // Drama
  film("the-shawshank-redemption-1994", "Die Verurteilten", 1994, "Drama", "The Shawshank Redemption 1994"),
  film("forrest-gump-1994", "Forrest Gump", 1994, "Drama", "Forrest Gump 1994"),
  film("titanic-1997", "Titanic", 1997, "Drama", "Titanic 1997"),
  film("american-beauty-1999", "American Beauty", 1999, "Drama", "American Beauty 1999"),
  film("schindlers-list-1993", "Schindlers Liste", 1993, "Drama", "Schindler's List 1993"),
  film("oppenheimer-2023", "Oppenheimer", 2023, "Drama", "Oppenheimer 2023"),
  // Sci-Fi
  film("inception-2010", "Inception", 2010, "Sci-Fi", "Inception 2010"),
  film("interstellar-2014", "Interstellar", 2014, "Sci-Fi", "Interstellar 2014"),
  film("the-matrix-1999", "Matrix", 1999, "Sci-Fi", "The Matrix 1999"),
  film("gravity-2013", "Gravity", 2013, "Sci-Fi", "Gravity 2013"),
  film("dune-2021", "Dune", 2021, "Sci-Fi", "Dune 2021"),
  // Horror
  film("the-shining-1980", "The Shining", 1980, "Horror", "The Shining 1980"),
  film("halloween-1978", "Halloween", 1978, "Horror", "Halloween 1978"),
  film("get-out-2017", "Get Out", 2017, "Horror", "Get Out 2017"),
  film("the-exorcist-1973", "Der Exorzist", 1973, "Horror", "The Exorcist 1973"),
  // Thriller
  film("the-silence-of-the-lambs-1991", "Das Schweigen der Lämmer", 1991, "Thriller", "The Silence of the Lambs 1991"),
  film("fight-club-1999", "Fight Club", 1999, "Thriller", "Fight Club 1999"),
  film("parasite-2019", "Parasite", 2019, "Thriller", "Parasite 2019"),
  // Animation
  film("spirited-away-2001", "Das Kaiserreich des Himmels", 2001, "Animation", "Spirited Away 2001"),
  film("toy-story-1995", "Toy Story", 1995, "Animation", "Toy Story 1995"),
  film("finding-nemo-2003", "Findet Nemo", 2003, "Animation", "Finding Nemo 2003"),
  // Fantasy
  film("the-fellowship-of-the-ring-2001", "Der Herr der Ringe: Die Gemeinschaft des Rings", 2001, "Fantasy", "The Lord of the Rings: The Fellowship of the Ring 2001"),
  film("philosophers-stone-2001", "Harry Potter und der Stein der Weisen", 2001, "Fantasy", "Harry Potter and the Philosopher's Stone 2001"),
  // Krimi
  film("pulp-fiction-1994", "Pulp Fiction", 1994, "Krimi", "Pulp Fiction 1994"),
  film("the-godfather-1972", "Der Pate", 1972, "Krimi", "The Godfather 1972"),
  film("se7en-1995", "Se7en", 1995, "Krimi", "Se7en 1995"),
  // Dokumentarfilm
  film("free-solo-2018", "Free Solo", 2018, "Dokumentarfilm", "Free Solo 2018"),
];

/** Alle im Katalog vorkommenden Genres, sortiert. */
export function catalogGenres() {
  return [...new Set(catalog.map((f) => f.genre))].sort((a, b) => a.localeCompare(b));
}

/**
 * Sucht einen Film nach seiner stabilen ID.
 * @param {string} id
 * @returns {object|undefined}
 */
export function findFilmById(id) {
  return catalog.find((f) => f.id === id);
}
