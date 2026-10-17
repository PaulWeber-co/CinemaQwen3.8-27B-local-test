<!-- Basis: main @ a96b1d5e42f115237468f05bcabcd6ed4f8f93fb · Modell: Qwen3.8-27B-4bit · gestartet 2026-10-17 14:19 -->
# Auftrag

Baue mir eine moderne, interaktive Web-App namens "CineMatch" (Single-Page-Application mit HTML, TailwindCSS via CDN und Vanilla JavaScript oder React via Vite – wähle, was schneller und stabiler sofort im Browser läuft). Die App soll ein modernes Kino-Streaming-Design im Dark Mode (Anthrazit, Akzentfarben in Neon-Violett/Gold, abgerundete Karten, Glasmorphismus-Effekte) haben.

### Kern-Idee:
Zwei Personen bewerten unabhängig voneinander Filme, markieren "Gesehen" oder "Watchlist" und wählen ihre Lieblingsgenres. Am Ende generiert Person A einen kompakten Share-Code (Text-String), schickt ihn an Person B, Person B fügt ihn bei sich ein und ein Algorithmus berechnet ein detailliertes "Filmgeschmack-Match" in Prozent.

### 1. Datenquelle & Film-Katalog (KEIN API-Key nötig!):
- Nutze für echte Filmcover, Erscheinungsjahre und deutsche Beschreibungen (Klappentexte) die frei zugängliche **Apple iTunes Search API** (`https://itunes.apple.com/search?term=...&media=movie&country=de&limit=1`), da diese ohne API-Key im Frontend funktioniert.
- Erstelle im Code eine kuratierte Start-Bestenliste von ca. 30-40 sehr bekannten Kult- und Blockbuster-Filmen verschiedener Genres (z.B. Inception, The Dark Knight, Pulp Fiction, Interstellar, Parasite, Chihiros Reise ins Zauberland, Matrix, Dune, La La Land, Shutter Island, Avengers: Endgame, Grand Budapest Hotel, etc.), deren Cover und Klappentexte beim Laden (oder gecached) von der iTunes API geholt werden.
- Baue zusätzlich eine **Live-Suchleiste** ein, mit der man über die iTunes API jeden beliebigen weiteren Film live suchen und seiner Bewertungsliste hinzufügen kann.

### 2. User-Flow & Features:
**Schritt 1: Dein Name & Lieblings-Genres**
- Eingabefeld für den eigenen Namen.
- Auswahl von bis zu 5 Lieblings-Genres (z.B. Sci-Fi, Action, Drama, Comedy, Horror, Thriller, Animation, Romance, Mindfuck, Fantasy) als schicke anklickbare Pills/Chips.

**Schritt 2: Filme bewerten & abhaken**
- Zeige die Filme als schönes Grid mit hochauflösendem Poster, Titel, Jahr und einem Button/Hover für den kurzen Klappentext (Modal oder aufklappbar).
- Pro Film kann der Nutzer ganz einfach interagieren:
  1. **1 bis 5 Sterne vergeben** (impliziert automatisch "Habe ich gesehen").
  2. Oder einen Button **"Noch nicht gesehen / Will ich sehen (Watchlist)"** anklicken.
  3. Filme, die man weder gesehen hat noch sehen will, lässt man einfach unberührt.

**Schritt 3: Teilen & Vergleichen (Code-Generator)**
- Ein Bereich "Mit Freund vergleichen":
  - **Button "Meinen Code kopieren":** Verpackt den Namen, die gewählten Genres, alle bewerteten Filme (Film-ID, Titel, Poster-URL + Sterne 1-5) und die Watchlist-Filme in ein kompaktes JSON, komprimiert/codiert es als Base64-String und kopiert es in die Zwischenablage.
  - **Eingabefeld "Code vom Freund einfügen":** Hier kann man den Base64-String des anderen reinpasten und auf "Match berechnen!" klicken.

### 3. Der Matching-Algorithmus & Auswertungs-Screen:
Wenn der Code eingefügt wird, zeige ein cooles Analyse-Dashboard:
1. **Gesamt-Match in Prozent (Großer animierter Kreis/Gauge):**
   - Berechne den Score aus 70% Film-Bewertungs-Übereinstimmung und 30% Genre-Übereinstimmung.
   - **WICHTIG:** Nimm für den Film-Bewertungs-Vergleich **NUR Filme, die BEIDE gesehen und mit Sternen bewertet haben**!
   - Formel pro gemeinsam gesehenem Film: `100% - (|Sterne_A - Sterne_B| / 4 * 100%)`. (Beispiel: Beide geben 5 Sterne = 100% Match für diesen Film. Einer gibt 5, einer 1 = 0% Match).
2. **Größte Gemeinsamkeiten ("Seelenverwandt bei..."):**
   - Zeige die Filme (mit Poster), die beide gesehen haben und bei denen beide ähnlich hoch (oder beide extrem niedrig!) bewertet haben (geringste Differenz).
3. **Größtes Streitpotenzial ("Größte Unterschiede"):**
   - Zeige die Filme, die beide gesehen haben, aber bei denen die Sterne-Bewertungen am weitesten auseinanderliegen (z.B. Person A: 5 Sterne, Person B: 2 Sterne).
4. **Gemeinsamer Filmabend ("Beide noch auf der Watchlist" oder "Einer liebt ihn, der andere kennt ihn noch nicht"):**
   - Zeige als Bonus Filme, die beide auf "Will ich sehen" gesetzt haben, ODER Filme, denen einer 5 Sterne gegeben hat und die der andere noch nicht gesehen hat.

### 4. Technische Anforderungen:
- Speichere meine eigene Auswahl automatisch im `localStorage`, damit nichts verloren geht, wenn ich die Seite neu lade.
- Füge einen "Demo-Freund laden"-Button beim Code-Import hinzu, der einen vorgefertigten Test-Code einfügt, damit ich das Matching-Dashboard sofort alleine testen kann.
- Starte am Ende direkt einen lokalen Entwicklungsserver, damit ich mir das Ergebnis im Browser ansehen kann.
