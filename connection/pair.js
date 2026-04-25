const { makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { makeid } = require('./gen-id');
const SessionStore = require('./sessionStore');

class PairClient {
    constructor(sessionId, storeDir = './sessions') {
        this.sessionId = sessionId;
        this.store = new SessionStore(storeDir);
        this.sock = null;
    }

    async init() {
        if (this.sock) return this.sock;
        const sessionPath = this.store.getPath(this.sessionId);
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome'),
            markOnlineOnConnect: false
        });
        this.sock.ev.on('creds.update', saveCreds);
        return this.sock;
    }

    async getPairingCode(phoneNumber) {
        if (!this.sock) await this.init();
        // Remove any non-digit characters
        const num = phoneNumber.replace(/[^0-9]/g, '');
        const code = await this.sock.requestPairingCode(num);
        return code;
    }

    async getQR() {
        if (!this.sock) await this.init();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('QR timeout')), 30000);
            const handler = (update) => {
                if (update.qr) {
                    clearTimeout(timeout);
                    this.sock.ev.off('connection.update', handler);
                    resolve(update.qr);
                }
            };
            this.sock.ev.on('connection.update', handler);
        });
    }

    async disconnect() {
        if (this.sock) {
            this.sock.end();
            this.sock = null;
        }
        // Optionally delete session folder
        // this.store.deleteSession(this.sessionId);
    }
}

module.exports = PairClient;
