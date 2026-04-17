'use strict';

const utils = require('@iobroker/adapter-core');
const http  = require('http');

// Feste Gruppen: config-Key → exakter fub-Name im ETAtouch-Menübaum
const FIXED_GROUPS = {
    groupPuffer: 'PufferFlex',
    groupKessel: 'Kessel',
    groupHK:     'HK',
    groupLager:  'Lager',
    groupKamin:  'Kamin'
};

class MeinETA extends utils.Adapter {

    constructor(options) {
        super({ ...options, name: 'meineta' });
        this.pollTimer = null;
        this.groupMap  = {};
        this.on('ready',  this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // info.connection Objekt anlegen bevor setState aufgerufen wird
        await this.setObjectNotExistsAsync("info.connection", {
            type: "state",
            common: { name: "Connection", type: "boolean", role: "indicator.connected", read: true, write: false },
            native: {}
        });
        this.setState('info.connection', false, true);

        const ip   = this.config.ip;
        const port = parseInt(this.config.port) || 8080;

        if (!ip) {
            this.log.warn('Keine IP konfiguriert – Adapter wartet auf Konfiguration.');
            return;
        }

        this.baseUrl = `http://${ip}:${port}`;
        this.log.info(`MeinETA gestartet – Ziel: ${this.baseUrl}`);

        // Welche Gruppen sind aktiviert?
        this.activeGroups = Object.entries(FIXED_GROUPS)
            .filter(([key]) => this.config[key] !== false)
            .map(([, name]) => name);

        this.log.info(`Aktive Gruppen: ${this.activeGroups.join(', ')}`);

        try {
            await this.fetchAndParseMenu();
            await this.pollAll();
            this.scheduleNextPoll();
        } catch (e) {
            this.log.error(`Startfehler: ${e.message}`);
        }
    }

    onUnload(callback) {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        callback();
    }

    // ── HTTP ──────────────────────────────────────────────────────────────────

    httpGet(path) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${path}`;
            const req = http.get(url, { timeout: 10000 }, (res) => {
                let data = '';
                res.on('data', c => (data += c));
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode} – ${url}`));
                    } else {
                        resolve(data);
                    }
                });
            });
            req.on('error',   reject);
            req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout – ${url}`)); });
        });
    }

    // ── XML-Parser (ohne externe Abhängigkeit) ────────────────────────────────

    parseAttributes(tagStr) {
        const attrs = {};
        const re = /(\w+)="([^"]*)"/g;
        let m;
        while ((m = re.exec(tagStr)) !== null) attrs[m[1]] = m[2];
        return attrs;
    }

    parseMenuXml(xml) {
        const groupMap = {};
        const fubRe = /<fub([^>]*)>([\s\S]*?)<\/fub>/g;
        let fubMatch;
        while ((fubMatch = fubRe.exec(xml)) !== null) {
            const attrs   = this.parseAttributes(fubMatch[1]);
            const fubName = attrs.name || attrs.uri || '';
            const fubUri  = attrs.uri  || '';
            const vars    = [];
            this.collectVars(fubMatch[2], [], vars);
            groupMap[fubName] = { name: fubName, fubUri, vars };
        }
        return groupMap;
    }

    /**
     * Parst eine Liste von <object>-Tags korrekt unter Berücksichtigung von
     * Verschachtelung. Der naive Regex-Ansatz versagt bei tief verschachtelten
     * Strukturen, da </object> immer beim ersten Treffer matcht.
     *
     * Stattdessen: Zeichenbasiertes Vorwärtslesen mit Zähler für offene Tags.
     */
    collectVars(chunk, pathParts, result) {
        let i = 0;
        while (i < chunk.length) {
            // Nächstes öffnendes <object suchen
            const start = chunk.indexOf('<object', i);
            if (start === -1) break;

            // Tag-Ende finden (könnte self-closing sein)
            const tagEnd = chunk.indexOf('>', start);
            if (tagEnd === -1) break;

            const tagStr     = chunk.slice(start + 7, tagEnd); // alles nach "<object"
            const selfClose  = chunk[tagEnd - 1] === '/';
            const attrs      = this.parseAttributes(tagStr);
            const name       = attrs.name || attrs.uri || '';
            const uri        = attrs.uri  || '';
            const fullPath   = [...pathParts, name].join('.');

            if (selfClose) {
                // <object ... /> – Blattknoten
                if (uri) result.push({ uri, name: fullPath });
                i = tagEnd + 1;
            } else {
                // <object ...> – finde das zugehörige </object> mit Tiefenzähler
                let depth = 1;
                let j = tagEnd + 1;
                while (j < chunk.length && depth > 0) {
                    const nextOpen  = chunk.indexOf('<object', j);
                    const nextClose = chunk.indexOf('</object>', j);
                    if (nextClose === -1) break;
                    if (nextOpen !== -1 && nextOpen < nextClose) {
                        // Prüfe ob es wirklich ein öffnendes Tag ist (nicht self-closing)
                        const nextTagEnd = chunk.indexOf('>', nextOpen);
                        if (chunk[nextTagEnd - 1] !== '/') depth++;
                        j = nextTagEnd + 1;
                    } else {
                        depth--;
                        if (depth === 0) {
                            // inner = Inhalt zwischen öffnendem und schließendem Tag
                            const inner = chunk.slice(tagEnd + 1, nextClose);
                            if (uri) result.push({ uri, name: fullPath });
                            // Rekursiv in Kinder absteigen
                            this.collectVars(inner, [...pathParts, name], result);
                            i = nextClose + 9; // 9 = "</object>".length
                        } else {
                            j = nextClose + 9;
                        }
                    }
                }
                if (depth > 0) break; // Fehlerfall
            }
        }
    }

    parseVarXml(xml) {
        const m = /<value([^>]*)>([\s\S]*?)<\/value>/.exec(xml);
        if (!m) return null;
        const attrs = this.parseAttributes(m[1]);
        attrs.rawValue = m[2].trim();
        return attrs;
    }

    // ── Menübaum abrufen ──────────────────────────────────────────────────────

    async fetchAndParseMenu() {
        const xml     = await this.httpGet('/user/menu');
        this.groupMap = this.parseMenuXml(xml);
        this.setState('info.connection', true, true);
        const names = Object.keys(this.groupMap);
        this.log.debug(`Menü geparst – ${names.length} fubs: ${names.join(', ')}`);
    }

    // ── Polling ───────────────────────────────────────────────────────────────

    async pollAll() {
        for (const groupName of this.activeGroups) {
            const group = this.groupMap[groupName];
            if (!group) {
                this.log.warn(`Gruppe "${groupName}" nicht im Menübaum gefunden – übersprungen.`);
                continue;
            }
            await this.pollGroup(group);
        }
    }

    async pollGroup(group) {
        const safeGroup = this.sanitize(group.name);
        let ok = 0, fail = 0;

        for (const v of group.vars) {
            try {
                const xml  = await this.httpGet(`/user/var${v.uri}`);
                const data = this.parseVarXml(xml);
                if (!data) continue;

                const scaleFactor = parseFloat(data.scaleFactor) || 1;
                const decPlaces   = parseInt(data.decPlaces)     || 0;
                const rawNum      = parseFloat(data.rawValue);
                const numValue    = isNaN(rawNum) ? null : rawNum / scaleFactor;

                // v.name kann Punkte als Pfadtrenner enthalten (z.B. "Fühler 1 (oben).Zustand")
                // → jedes Segment einzeln sanitizen, dann mit . zusammenfügen
                const namePath = v.name.split('.').map(s => this.sanitize(s)).filter(s => s.length > 0).join('.');
                const objId = `${safeGroup}.${namePath}`;

                await this.setObjectNotExistsAsync(objId, {
                    type: 'state',
                    common: {
                        name:  `${group.name} – ${v.name}`,
                        type:  numValue !== null ? 'number' : 'string',
                        role:  'value',
                        unit:  data.unit || '',
                        read:  true,
                        write: false
                    },
                    native: {
                        uri:           v.uri,
                        scaleFactor,
                        decPlaces,
                        advTextOffset: data.advTextOffset || '0'
                    }
                });

                const val = numValue !== null
                    ? parseFloat(numValue.toFixed(decPlaces))
                    : (data.strValue || data.rawValue);

                await this.setStateAsync(objId, { val, ack: true });
                ok++;
            } catch (e) {
                // HTTP 400/404 = Knoten hat keinen lesbaren Wert (z.B. reine Gruppenknoten)
                // → still ignorieren, kein warn-Spam
                if (e.message && (e.message.includes('HTTP 4') || e.message.includes('HTTP 5'))) {
                    this.log.debug(`Kein Wert für ${v.uri} (${e.message}) – übersprungen`);
                } else {
                    this.log.warn(`Fehler bei ${v.uri}: ${e.message}`);
                }
                fail++;
            }
        }
        this.log.debug(`Gruppe "${group.name}": ${ok} OK, ${fail} Fehler`);
    }

    scheduleNextPoll() {
        const ms = (parseInt(this.config.pollInterval) || 60) * 1000;
        this.pollTimer = setTimeout(async () => {
            try {
                await this.pollAll();
            } catch (e) {
                this.log.error(`Poll-Fehler: ${e.message}`);
                this.setState('info.connection', false, true);
            }
            this.scheduleNextPoll();
        }, ms);
    }

    // ── Hilfsfunktionen ───────────────────────────────────────────────────────

    sanitize(str) {
        return str
            .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe')
            .replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-zA-Z0-9_\-.]/g, '_')
            .replace(/__+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '');
    }
}

if (require.main !== module) {
    module.exports = (options) => new MeinETA(options);
} else {
    new MeinETA();
}
