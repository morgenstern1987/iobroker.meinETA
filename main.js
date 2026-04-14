"use strict";

const utils = require("@iobroker/adapter-core");
const EtaClient = require("./lib/etaClient");
const { extractVariables } = require("./lib/menuParser");
const { buildObjectPath } = require("./lib/nameMapper");

class MeinEta extends utils.Adapter {

    constructor(options) {

        super({
            ...options,
            name: "meineta"
        });

        this.uriMap = {};

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));

    }

    async onReady() {

        try {

            if (!this.config.host) {
                this.log.error("Keine ETA IP konfiguriert");
                return;
            }

            this.client = new EtaClient(this.config.host, this.config.port);

            await this.createVarSet();

            await this.discoverVariables();

            this.subscribeStates("*");

            this.log.info("Discovery abgeschlossen");

            setTimeout(() => {

                this.pollVars();

                this.pollTimer = setInterval(() => {

                    this.pollVars();
                    this.pollErrors();

                }, this.config.pollInterval);

            }, 5000);

        } catch (error) {

            this.log.error(`Startfehler: ${error}`);

        }

    }

    async createVarSet() {

        try {

            await this.client.put(`/user/vars/${this.config.varset}`);

        } catch {

            this.log.debug("VarSet existiert bereits");

        }

    }

    async discoverVariables() {

        try {

            this.log.info("Lese ETA Menüstruktur");

            const data = await this.client.get("/user/menu");

            const menu = data.eta.menu[0];

            const variables = extractVariables(menu);

            this.log.info(`Gefundene Variablen: ${variables.length}`);

            for (const v of variables) {

                const id = buildObjectPath(v.path);

                this.uriMap[v.uri] = id;

                await this.createObjectTree(id, v.name, v.uri);

                const uri = v.uri.replace(/^\//, "");

                try {

                    await this.client.put(`/user/vars/${this.config.varset}/${uri}`);

                } catch {

                    this.log.debug(`Var nicht hinzugefügt: ${uri}`);

                }

            }

        } catch (error) {

            this.log.error(`Discovery Fehler: ${error}`);

        }

    }

    async createObjectTree(id, name, uri) {

        const parts = id.split(".");

        let path = "";

        for (let i = 0; i < parts.length; i++) {

            path = path ? `${path}.${parts[i]}` : parts[i];

            const isLast = i === parts.length - 1;

            const exists = await this.getObjectAsync(path);

            if (exists) continue;

            if (isLast) {

                await this.setObjectAsync(path, {
                    type: "state",
                    common: {
                        name,
                        type: "number",
                        role: "value",
                        read: true,
                        write: true
                    },
                    native: {
                        uri
                    }
                });

            } else {

                await this.setObjectAsync(path, {
                    type: "channel",
                    common: {
                        name: parts[i]
                    },
                    native: {}
                });

            }

        }

    }

    async pollVars() {

        try {

            const data = await this.client.get(`/user/vars/${this.config.varset}`);

            const vars = data?.eta?.vars?.[0]?.variable;

            if (!vars) return;

            for (const v of vars) {

                const uri = v.$.uri;

                const id = this.uriMap[uri];

                if (!id) continue;

                const raw = parseFloat(v._);

                const scale = parseFloat(v.$.scaleFactor || 1);

                const value = raw / scale;

                const unit = v.$.unit || "";

                const obj = await this.getObjectAsync(id);

                if (obj && unit && obj.common.unit !== unit) {

                    obj.common.unit = unit;

                    await this.setObjectAsync(id, obj);

                }

                await this.setStateAsync(id, value, true);

            }

        } catch (error) {

            this.log.error(`Polling Fehler: ${error}`);

        }

    }

    async pollErrors() {

        try {

            const data = await this.client.get("/user/errors");

            await this.setObjectNotExistsAsync("errors.raw", {
                type: "state",
                common: {
                    name: "Active Errors",
                    type: "string",
                    role: "json",
                    read: true,
                    write: false
                },
                native: {}
            });

            await this.setStateAsync("errors.raw", JSON.stringify(data), true);

        } catch (error) {

            this.log.error(`Error Polling Fehler: ${error}`);

        }

    }

    async onStateChange(id, state) {

        if (!state || state.ack) return;

        const obj = await this.getObjectAsync(id);

        if (!obj?.native?.uri) return;

        const raw = Math.round(state.val);

        try {

            await this.client.post(`/user/var${obj.native.uri}`, `value=${raw}`);

        } catch (error) {

            this.log.error(`Write Fehler: ${error}`);

        }

    }

}

if (require.main !== module) {
    module.exports = (options) => new MeinEta(options);
} else {
    new MeinEta();
}
