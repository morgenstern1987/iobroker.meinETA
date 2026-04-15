# ioBroker ETA Touch Adapter

Liest Werte von ETA Touch Pelletheizungen über die offizielle RESTful API aus und stellt sie als ioBroker-Objekte bereit.

## Voraussetzungen

- ETAtouch-Systemsoftware **≥ 1.20.0**
- Gerät bei [meineta.at](http://www.meineta.at) registriert
- LAN-Zugang bei meineta.at beantragt **und** am Gerät in den Systemeinstellungen aktiviert
- ioBroker mit Node.js ≥ 18

## Installation

### Über den ioBroker Admin (empfohlen)

Solange der Adapter nicht im offiziellen Repository ist, manuell installieren:

```bash
cd /opt/iobroker
npm install /pfad/zum/adapter/iobroker.eta-touch
iobroker add eta-touch
```

Oder direkt aus GitHub (sobald du das Repo gepusht hast):

```bash
cd /opt/iobroker
npm install github:DEIN-GITHUB-USER/iobroker.eta-touch
iobroker add eta-touch
```

### Einrichtung

1. Adapter-Instanz öffnen → Einstellungen
2. **IP-Adresse** des ETAtouch eingeben (z. B. `192.168.10.193`)
3. **Port** auf `8080` belassen (Standard)
4. **Abfrage-Intervall** wählen (Standard: 60 Sekunden)
5. Auf **„Gruppen laden"** klicken – der Adapter fragt automatisch den Menübaum des ETAtouch ab
6. Gewünschte **Objektgruppen** auswählen (z. B. „Kessel", „PufferFlex", „HK")
7. Speichern & Adapter neu starten

## Objektstruktur

```
eta-touch.0
├── info
│   └── connection          (true/false)
├── Kessel
│   ├── Volllaststunden     (number, h)
│   ├── Ein_Aus_Taste       (number)
│   └── ...
├── PufferFlex
│   ├── Ladezustand         (number, %)
│   └── ...
└── HK
    ├── Betrieb             (number)
    └── ...
```

Jede Gruppe entspricht einem **fub** (Functional Block) im ETAtouch-Menübaum.  
Innerhalb einer Gruppe werden **alle Blattknoten** (Endpunkte ohne Unterpunkte) als States angelegt.

## Werte verstehen

| Attribut | Bedeutung |
|---|---|
| `scaleFactor` | Rohwert ÷ scaleFactor = angezeigter Wert |
| `decPlaces` | Anzahl Dezimalstellen |
| `unit` | Einheit (°C, %, h, …) |
| `advTextOffset` | Bei Textvariablen: Offset, um Bool-Wert zu berechnen (rawValue - advTextOffset) |

Beispiel: Rohwert `1803`, advTextOffset `1802` → `1803 - 1802 = 1` → „Ein"

## Schreibzugriff

Dieser Adapter ist **read-only**. Das Schreiben von Werten ist nicht implementiert, da:
- Die meisten Heizungsparameter sicherheitskritisch sind
- ETAtouch die API nur für autorisierte LAN-Zugriffe öffnet

## API-Dokumentation

ETAtouch RESTful Webservices Version 1.2 (November 2019)

- `GET /user/menu` – Menübaum
- `GET /user/var/{uri}` – Einzelwert lesen
- `GET /user/errors` – Aktive Fehler (noch nicht implementiert)

## Changelog

### 1.0.0
- Erstveröffentlichung
- Menübaum parsen und Gruppen auswählen
- Regelmäßiges Polling der ausgewählten Gruppen
- Admin-UI mit Gruppenauswahl

## Lizenz

MIT © ioBroker User
