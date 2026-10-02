# Sport-CRM Schweiz

CRM zur Pflege von **Sportvereinen, Agenturen und Verbänden der Schweiz** inklusive **Leads**, Ansprechpersonen und Aktivitäten.
Vereinsdaten werden automatisch aus dem Internet gesammelt und lassen sich jederzeit manuell ergänzen oder korrigieren.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) **22.5 oder neuer** (keine weiteren Pakete nötig, die Datenbank ist SQLite).

```bash
cd sport-crm
npm start
```

Danach im Browser **http://localhost:3000** öffnen. Die Daten liegen in `sport-crm/data/crm.db` (für ein Backup einfach diese Datei kopieren).

| Umgebungsvariable | Bedeutung | Standard |
|---|---|---|
| `PORT` | Port des Webservers | `3000` |
| `HOST` | Adresse; `0.0.0.0` macht das CRM im ganzen Netzwerk erreichbar (ohne Login!) | `127.0.0.1` |
| `DB_FILE` | Pfad zur Datenbank | `data/crm.db` |
| `OVERPASS_URL` | Overpass-Server (kommagetrennt, werden der Reihe nach probiert) | overpass-api.de, overpass.kumi.systems |

## Funktionen

**Organisationen** (Typ Sportverein / Agentur / Verband)
- Stammdaten: Name, Sportart(en), Verband, Adresse, Kanton, Telefon, E-Mail, Website, Facebook, Instagram, LinkedIn, Mitglieder, Gründungsjahr, Beschreibung, Notizen, Tags, Status
- Liste mit Suche und Filtern (Typ, Kanton, Sportart, Status, «ohne E-Mail/Telefon», «mit Leads»), Sortierung, Seitenumbruch
- Ansprechpersonen pro Organisation
- Aktivitäten-Verlauf (Notiz, Anruf, E-Mail, Meeting, Aufgabe)
- Duplikat-Erkennung beim Erfassen (über Website-Domain oder Name + PLZ)

**Leads**
- Phasen: Neu → Kontaktiert → Qualifiziert → Angebot → Verhandlung → Gewonnen / Verloren
- Wert in CHF, Wahrscheinlichkeit, Ansprechperson, Verantwortlich, nächster Schritt, Fälligkeitsdatum
- Kanban-Board mit Drag & Drop oder Listenansicht; Phasenwechsel landen automatisch im Aktivitäten-Verlauf
- Übersicht mit fälligen Leads, Pipeline-Summen und Verteilung nach Kanton

**Daten sammeln** (Menü «Daten sammeln»)
1. **OpenStreetMap-Import**: holt pro Kanton alle als Sportverein erfassten Objekte (`club=sport`, `leisure=sports_club`, …) bzw. Werbe-, Marketing- und Eventagenturen, inkl. Adresse, Sportart, Website, Telefon, E-Mail und Koordinaten. Erneutes Ausführen aktualisiert die Einträge, statt Duplikate anzulegen.
2. **Website-Auswertung**: besucht die Websites (Startseite + Kontakt-/Impressum-Seiten) und ergänzt **nur leere Felder**: E-Mail, Telefon, Adresse und Social-Media-Links. Auch einzeln pro Organisation über «Web-Daten ergänzen».
3. **Aus Website erfassen**: neue Organisation über die Website-Adresse anlegen; das Formular wird mit den gefundenen Daten vorausgefüllt.
4. **CSV-Import/-Export**: z.B. Vereinslisten von Verbänden oder Excel-Listen (Spaltennamen werden automatisch erkannt: Name/Verein, PLZ, Ort, Kanton, E-Mail, Website, Sportart …). Der Export ist mit Excel kompatibel (Semikolon, UTF-8).

### Manuelle Daten haben Vorrang

Jedes Feld, das du von Hand änderst, wird als **«manuell»** markiert und von späteren Importen nicht mehr überschrieben.
Klickst du in der Detailansicht auf die Markierung «manuell», darf das Feld beim nächsten Import wieder aktualisiert werden.
Status, Notizen, Tags, Kontakte, Leads und Aktivitäten werden von Importen nie verändert.

## Hinweise zu den Datenquellen

- **Vollständigkeit**: In der Schweiz gibt es rund 19'000 Sportvereine. OpenStreetMap enthält davon nur einen Teil, oft ohne E-Mail-Adresse.
  Für eine möglichst vollständige Liste empfiehlt es sich, zusätzlich die Vereinslisten der Verbände (z.B. Fussball, Turnen, Unihockey, Tennis) als CSV zu importieren
  und danach die Website-Auswertung laufen zu lassen.
- **Lizenz**: OSM-Daten © OpenStreetMap-Mitwirkende, lizenziert unter der [ODbL](https://www.openstreetmap.org/copyright).
- **Fairness beim Abrufen**: Der Website-Abruf identifiziert sich als `SportCRM/1.0`, beachtet `robots.txt` und ruft pro Website höchstens alle 1,5 s eine Seite ab.
- **Datenschutz (DSG)**: Gesammelte Kontaktdaten (insbesondere Namen und E-Mails von Personen) sind Personendaten. Verwende sie nur für den vorgesehenen Zweck,
  biete bei Werbe-E-Mails eine Abmeldemöglichkeit an und lösche Daten auf Anfrage.

## Entwicklung

```bash
npm test        # Unit- und API-Tests (node:test)
```

Aufbau:

```
server.js          HTTP-Server + REST-API (/api/…), liefert die Oberfläche aus
lib/db.js          SQLite-Schema und Datenzugriff (Organisationen, Kontakte, Leads, Aktivitäten, Jobs)
lib/osm.js         Overpass-Abfrage und Umwandlung der OSM-Daten
lib/enrich.js      Auswertung von Websites (E-Mail, Telefon, Adresse, Social Media)
lib/fetcher.js     Abruf mit robots.txt-Prüfung und Drosselung
lib/jobs.js        Import-Jobs im Hintergrund
lib/csv.js         CSV-Import/-Export
public/            Oberfläche (HTML/CSS/JS, ohne Build-Schritt)
```
