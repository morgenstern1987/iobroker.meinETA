"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const xml2js = require("xml2js");

class EtaTouch extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: "eta-touch",
        });

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
    }

    async onReady() {

        this.baseUrl = `http://${this.config.host}:${this.config.port || 8080}`;

        this.log.info(`Connecting to ETA Touch at ${this.baseUrl}`);

        await this.getApiVersion();
        await this.getErrors();

        this.pollTimer = setInterval(() => {
            this.getErrors();
        }, this.config.pollInterval || 60000);
    }

    async request(path) {
        const url = `${this.baseUrl}${path}`;
        const res = await axios.get(url);
        return xml2js.parseStringPromise(res.data);
    }

    async getApiVersion() {

        try {

            const data = await this.request("/user/api");

            const version = data.eta.api[0].$.version;

            await this.setObjectNotExistsAsync("info.apiVersion", {
                type: "state",
                common: {
                    name: "API Version",
                    type: "string",
                    role: "info",
                    read: true,
                    write: false
                },
                native: {}
            });

            await this.setStateAsync("info.apiVersion", version, true);

        } catch (err) {
            this.log.error(err);
        }

    }

    async getErrors() {

        try {

            const data = await this.request("/user/errors");

            const errors = JSON.stringify(data);

            await this.setObjectNotExistsAsync("errors.active", {
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

            await this.setStateAsync("errors.active", errors, true);

        } catch (err) {
            this.log.error(err);
        }

    }

    async readVariable(addr) {

        const data = await this.request(`/user/var/${addr}`);

        const value = data.eta.value[0]._;

        const id = `values.${addr.replace(/\//g, "_")}`;

        await this.setObjectNotExistsAsync(id, {
            type: "state",
            common: {
                name: addr,
                type: "number",
                role: "value",
                read: true,
                write: true
            },
            native: {}
        });

        await this.setStateAsync(id, parseFloat(value), true);

    }

    async setVariable(addr, value) {

        const url = `${this.baseUrl}/user/var/${addr}`;

        await axios.post(url, `value=${value}`, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

    }

    async onStateChange(id, state) {

        if (!state || state.ack) return;

        const addr = id.split(".values.")[1].replace(/_/g, "/");

        await this.setVariable(addr, state.val);

    }

}

if (require.main !== module) {
    module.exports = (options) => new EtaTouch(options);
} else {
    new EtaTouch();
}
