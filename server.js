const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'blackangel_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ===============================
// DATA FILES & DIRECTORIES
// ===============================
const USERS_FILE = path.join(__dirname, 'users.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');
const ACTIVE_SESSIONS_FILE = path.join(__dirname, 'connectedUsers.json');
const UPLOAD_DIR = path.join(__dirname, 'public/uploads');

function ensureDirs() {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
ensureDirs();

function ensureFiles() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
    }
    if (!fs.existsSync(PENDING_FILE)) {
        fs.writeFileSync(PENDING_FILE, JSON.stringify({ pending: [] }, null, 2));
    }
    if (!fs.existsSync(ACTIVE_SESSIONS_FILE)) {
        fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify({}, null, 2));
    }
}
ensureFiles();

function readJSON(file) { return JSON.parse(fs.readFileSync(file)); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ===============================
// CREATE DEFAULT USERS
// ===============================
function createDefaultUsers() {
    const users = readJSON(USERS_FILE);
    if (users.users.length === 0) {
        users.users.push(
            { username: 'test', password: 'test', email: 'test@example.com', age: 25, gender: 'Other', country: 'Global', number: '1234567890', approvedAt: Date.now(), banned: false, premium: false },
            { username: 'Alpha', password: 'Alpha2026', email: 'alpha@blackangel.com', age: 25, gender: 'Male', country: 'Zimbabwe', number: '263776404156', approvedAt: Date.now(), banned: false, premium: true },
            { username: 'Prince', password: 'Prince2026', email: 'prince@blackangel.com', age: 28, gender: 'Male', country: 'South Africa', number: '27711234567', approvedAt: Date.now(), banned: false, premium: true }
        );
        writeJSON(USERS_FILE, users);
        console.log('✅ Default users created');
    }
}
createDefaultUsers();

// ===============================
// PUBLIC API ROUTES
// ===============================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    if (username === 'admin' && password === 'BlackAngel') {
        req.session.user = { username: 'admin', role: 'admin' };
        return res.json({ success: true, redirect: '/admin.html' });
    }
    const user = users.users.find(u => u.username === username && u.password === password);
    if (user) {
        if (user.banned) return res.json({ success: false, message: 'Banned' });
        req.session.user = { username: user.username, role: 'user', email: user.email, premium: user.premium || false };
        res.json({ success: true, redirect: '/dashboard.html' });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/register', (req, res) => {
    const { email, username, password, age, gender, country, number } = req.body;
    const users = readJSON(USERS_FILE);
    if (users.users.find(u => u.username === username)) {
        return res.json({ success: false, message: 'Username exists' });
    }
    const pending = readJSON(PENDING_FILE);
    if (pending.pending.find(p => p.username === username)) {
        return res.json({ success: false, message: 'Already pending' });
    }
    pending.pending.push({ email, username, password, age, gender, country, number, timestamp: Date.now() });
    writeJSON(PENDING_FILE, pending);
    res.json({ success: true, message: 'Registration submitted for admin approval.' });
});

app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ===============================
// WHATSAPP PAIRING (Connection module – optional)
// ===============================
// If the Connection folder does not exist, we provide a fallback
let PairClient = null;
try {
    const { PairClient: PC } = require('./Connection');
    PairClient = PC;
    console.log('✅ Connection module loaded');
} catch (err) {
    console.warn('⚠️ Connection module not found – pairing will be disabled.');
}

app.post('/api/request-qr', async (req, res) => {
    if (!PairClient) return res.status(501).json({ error: 'Pairing not configured' });
    const sessionId = req.session.id;
    if (!sessionId) return res.status(400).json({ error: 'No session' });
    const pair = new PairClient(sessionId, './AlphaPrince_web');
    try {
        const qrString = await pair.getQR();
        const qrDataURL = await QRCode.toDataURL(qrString);
        res.json({ qr: qrDataURL });
    } catch (err) {
        console.error('QR error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/request-pairing-code', async (req, res) => {
    if (!PairClient) return res.status(501).json({ error: 'Pairing not configured' });
    const sessionId = req.session.id;
    const { phoneNumber } = req.body;
    if (!sessionId || !phoneNumber) return res.status(400).json({ error: 'Missing data' });
    const pair = new PairClient(sessionId, './AlphaPrince_web');
    try {
        const code = await pair.getPairingCode(phoneNumber);
        res.json({ success: true, code });
    } catch (err) {
        console.error('Pairing error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        await pair.disconnect();
    }
});

// ===============================
// ACCOUNT MANAGEMENT
// ===============================
function isAuthenticated(req, res, next) {
    if (req.session.user && req.session.user.role === 'user') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `avatar_${req.session.user.username}_${Date.now()}${ext}`);
    }
});
const uploadSingle = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }).single('avatar');

app.post('/api/upload-avatar', isAuthenticated, (req, res) => {
    uploadSingle(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
        const avatarUrl = `/uploads/${req.file.filename}`;
        const users = readJSON(USERS_FILE);
        const user = users.users.find(u => u.username === req.session.user.username);
        if (user) user.avatar = avatarUrl;
        writeJSON(USERS_FILE, users);
        req.session.user.avatar = avatarUrl;
        res.json({ success: true, avatarUrl });
    });
});

app.post('/api/update-profile', isAuthenticated, (req, res) => {
    const { email, age, gender, country, number, oldPassword, newPassword } = req.body;
    const username = req.session.user.username;
    const users = readJSON(USERS_FILE);
    const user = users.users.find(u => u.username === username);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (email !== undefined) user.email = email;
    if (age !== undefined) user.age = age;
    if (gender !== undefined) user.gender = gender;
    if (country !== undefined) user.country = country;
    if (number !== undefined) user.number = number;
    if (oldPassword && newPassword) {
        if (user.password !== oldPassword) return res.json({ success: false, message: 'Wrong old password' });
        if (newPassword.length < 4) return res.json({ success: false, message: 'Password too short' });
        user.password = newPassword;
    }
    writeJSON(USERS_FILE, users);
    req.session.user.email = user.email;
    req.session.user.premium = user.premium;
    res.json({ success: true, message: 'Profile updated', user: { username: user.username, email: user.email, premium: user.premium } });
});

app.post('/api/delete-account', isAuthenticated, (req, res) => {
    const username = req.session.user.username;
    const users = readJSON(USERS_FILE);
    const newUsers = users.users.filter(u => u.username !== username);
    if (newUsers.length === users.users.length) return res.json({ success: false, message: 'User not found' });
    users.users = newUsers;
    writeJSON(USERS_FILE, users);
    req.session.destroy((err) => {
        if (err) return res.json({ success: false, message: 'Logout error' });
        res.json({ success: true, message: 'Account deleted' });
    });
});

// ===============================
// STATISTICS
// ===============================
app.get('/api/stats', (req, res) => {
    const users = readJSON(USERS_FILE);
    const sessions = readJSON(ACTIVE_SESSIONS_FILE);
    res.json({
        totalUsers: users.users.length,
        activeSessions: Object.keys(sessions).length,
        premiumUsers: users.users.filter(u => u.premium).length,
        bannedUsers: users.users.filter(u => u.banned).length
    });
});

// ===============================
// ADMIN ROUTES (simplified)
// ===============================
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(401).json({ error: 'Unauthorized' });
}
app.get('/api/admin/pending', isAdmin, (req, res) => {
    const pending = readJSON(PENDING_FILE);
    res.json(pending.pending);
});
app.post('/api/admin/approve', isAdmin, (req, res) => {
    const { username } = req.body;
    const pending = readJSON(PENDING_FILE);
    const idx = pending.pending.findIndex(u => u.username === username);
    if (idx === -1) return res.json({ success: false });
    const user = pending.pending[idx];
    const users = readJSON(USERS_FILE);
    users.users.push({ ...user, approvedAt: Date.now(), banned: false, premium: false });
    writeJSON(USERS_FILE, users);
    pending.pending.splice(idx, 1);
    writeJSON(PENDING_FILE, pending);
    res.json({ success: true });
});
app.post('/api/admin/decline', isAdmin, (req, res) => {
    const { username } = req.body;
    const pending = readJSON(PENDING_FILE);
    const idx = pending.pending.findIndex(u => u.username === username);
    if (idx === -1) return res.json({ success: false });
    pending.pending.splice(idx, 1);
    writeJSON(PENDING_FILE, pending);
    res.json({ success: true });
});
app.get('/api/admin/users', isAdmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    res.json(users.users.map(u => ({ ...u, password: undefined })));
});
app.post('/api/admin/ban', isAdmin, (req, res) => {
    const { username } = req.body;
    const users = readJSON(USERS_FILE);
    const u = users.users.find(u => u.username === username);
    if (u) u.banned = true;
    writeJSON(USERS_FILE, users);
    res.json({ success: !!u });
});
app.post('/api/admin/unban', isAdmin, (req, res) => {
    const { username } = req.body;
    const users = readJSON(USERS_FILE);
    const u = users.users.find(u => u.username === username);
    if (u) u.banned = false;
    writeJSON(USERS_FILE, users);
    res.json({ success: !!u });
});
app.post('/api/admin/premium', isAdmin, (req, res) => {
    const { username, premium } = req.body;
    const users = readJSON(USERS_FILE);
    const u = users.users.find(u => u.username === username);
    if (u) u.premium = premium;
    writeJSON(USERS_FILE, users);
    res.json({ success: !!u });
});

// ===============================
// SERVE HTML PAGES
// ===============================
app.get('/admin.html', (req, res) => {
    if (req.session.user?.role === 'admin') res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    else res.redirect('/index.html');
});
app.get('/dashboard.html', (req, res) => {
    if (req.session.user) res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    else res.redirect('/index.html');
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
    console.log(`💀 BlackAngel Web running on port ${PORT}`);
    console.log(`Admin: admin / BlackAngel`);
    console.log(`Test users: test/test, Alpha/Alpha2026, Prince/Prince2026`);
});
