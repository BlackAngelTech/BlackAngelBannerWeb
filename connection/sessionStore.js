const fs = require('fs');
const path = require('path');

class SessionStore {
    constructor(baseDir = './sessions') {
        this.baseDir = baseDir;
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    }

    getPath(sessionId) {
        return path.join(this.baseDir, `session_${sessionId}`);
    }

    saveCreds(sessionId, creds) {
        const dir = this.getPath(sessionId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify(creds, null, 2));
    }

    loadCreds(sessionId) {
        const file = path.join(this.getPath(sessionId), 'creds.json');
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file));
        }
        return null;
    }

    deleteSession(sessionId) {
        const dir = this.getPath(sessionId);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = SessionStore;
