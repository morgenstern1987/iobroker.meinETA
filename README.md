# ioBroker.meineta

![Logo](admin/eta-logo.png)

Liest Werte von **ETA Touch Pelletheizungen** über die offizielle RESTful API aus und stellt sie als ioBroker-Datenpunkte bereit.

---

## Voraussetzungen

- ETAtouch Systemsoftware **≥ 1.20.0**
- Gerät bei [meineta.at](http://www.meineta.at) registriert
- LAN-Zugang bei meineta.at beantragt **und** am Gerät in den Systemeinstellungen aktiviert
- ioBroker mit Node.js **≥ 18**

---

## Installation

```bash
cd /opt/iobroker
npm install github:morgenstern1987/iobroker.meineta
iobroker add meineta
```

---

## Konfiguration

| Einstellung | Beschreibung | Standard |
|---|---|---|
| IP-Adresse | IP des ETAtouch im lokalen Netzwerk | – |
| Port | HTTP-Port des ETAtouch | `8080` |
| Abfrage-Intervall | Wie oft Werte abgefragt werden (Sekunden) | `60` |
| Gruppen | Auswahl der zu überwachenden Bereiche | alle aktiv |

### Verfügbare Gruppen

| Gruppe | Beschreibung |
|---|---|
| ☑ PufferFlex | Pufferspeicher inkl. Fühler 1–4, Ladezeiten |
| ☑ Kessel | Pelletskessel, Temperaturen, Zähler |
| ☑ HK | Heizkreis, Heizkurve, Zeiten |
| ☑ Lager | Pelletsvorrat, Austragung |
| ☑ Kamin | Fremdwärme, Ladepumpe |

---

## Objektstruktur

```
meineta.0
├── info
│   └── connection                    true/false
├── PufferFlex
│   ├── Eingaenge
│   │   ├── Fuehler_1_oben            °C
│   │   ├── Fuehler_1_oben.Zustand
│   │   ├── Fuehler_2                 °C
│   │   └── ...
│   ├── Puffer
│   │   ├── Ladezustand               %
│   │   └── ...
│   └── ...
├── Kessel
│   ├── Volllaststunden               h
│   ├── Entaschentaste
│   └── ...
├── HK
│   ├── Heizzeiten
│   └── ...
├── Lager
│   ├── Vorrat                        kg
│   └── ...
└── Kamin
    └── ...
```

Jeder Knoten aus dem ETAtouch-Menübaum wird als Datenpunkt angelegt – inklusive aller Zwischenknoten (z.B. `Fühler 1 (oben)` mit eigenem Temperaturwert).

---

## Werte verstehen

| Attribut | Bedeutung |
|---|---|
| `scaleFactor` | Rohwert ÷ scaleFactor = angezeigter Wert (z.B. `783 / 10 = 78.3°C`) |
| `decPlaces` | Anzahl Dezimalstellen |
| `unit` | Einheit (`°C`, `%`, `h`, `kg`, …) |
| `advTextOffset` | Bei Textvariablen: Offset für Bool-Auswertung |

---

## API

Der Adapter nutzt die offizielle **ETAtouch RESTful Webservices API v1.2**:

| Endpunkt | Verwendung |
|---|---|
| `GET /user/menu` | Menübaum abrufen |
| `GET /user/var/{uri}` | Einzelwert lesen |

Schreibzugriff ist **nicht implementiert** – der Adapter ist rein lesend.

---

## Changelog

### 1.2.0
- Verschachtelungskorrekter XML-Parser (Fühler 1–4 korrekt zugeordnet)
- Elternknoten (z.B. Fühler-Temperaturen) werden als eigene Datenpunkte ausgegeben
- ETA-Logo hinzugefügt
- `info.connection` Objekt wird korrekt angelegt

### 1.1.0
- Feste Gruppen: PufferFlex, Kessel, HK, Lager, Kamin
- Trailing-Dot Bug in Objekt-IDs behoben

### 1.0.0
- Erstveröffentlichung

---

## Lizenz

MIT © [morgenstern1987](https://github.com/morgenstern1987)
