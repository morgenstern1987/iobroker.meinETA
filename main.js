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

            await this.ensureVarSet();

            await this.discoverVariables();

            setTimeout(() => {

                this.pollVars();

                this.pollTimer = setInterval(() => {

                    this.pollVars();
                    this.pollErrors();

                }, this.config.pollInterval);

            }, 5000);

        } catch (error) {

            this.log.error(error);

        }

    }

    async ensureVarSet() {

        try {

            await this.client.put(`/user/vars/${this.config.varset}`);

        } catch {

            this.log.debug("VarSet existiert bereits");

        }

    }

    async discoverVariables() {

        const data = await this.client.get("/user/menu");

        const menu = data.eta.menu[0];

        const variables = extractVariables(menu);

        this.log.info(`ETA Variablen gefunden: ${variables.length}`);

        for (const v of variables) {

            const id = buildObjectPath(v.path);

            this.uriMap[v.uri] = id;

            await this.createObjectTree(id, v.name, v.uri);

            const parts = v.uri.replace(/^\//, "").split("/");

            try {

                await this.client.put(`/user/vars/${this.config.varset}/${parts.join("/")}`);

            } catch (error) {

                this.log.debug(`Var nicht hinzugefügt: ${v.uri}`);

            }

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
                        write: false
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

            if (!vars) {
                this.log.warn("Keine Variablen vom ETA Server");
                return;
            }

            for (const v of vars) {

                const uri = v.$.uri;

                const id = this.uriMap[`/${uri}`];

                if (!id) continue;

                const raw = parseFloat(v._);
                const scale = parseFloat(v.$.scaleFactor || 1);

                const value = raw / scale;

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
                    name: "ETA Errors",
                    type: "string",
                    role: "json",
                    read: true,
                    write: false
                },
                native: {}
            });

            await this.setStateAsync("errors.raw", JSON.stringify(data), true);

        } catch {}

    }

}

if (require.main !== module) {
    module.exports = (options) => new MeinEta(options);
} else {
    new MeinEta();
}
