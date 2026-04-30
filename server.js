const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'blackangel_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Data files
const USERS_FILE = path.join(__dirname, 'users.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');
const ACTIVE_SESSIONS_FILE = path.join(__dirname, 'connectedUsers.json');

function ensureFiles() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
    if (!fs.existsSync(PENDING_FILE)) fs.writeFileSync(PENDING_FILE, JSON.stringify({ pending: [] }, null, 2));
    if (!fs.existsSync(ACTIVE_SESSIONS_FILE)) fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify({}, null, 2));
}
ensureFiles();

function readJSON(file) { return JSON.parse(fs.readFileSync(file)); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// Default users
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

// ========== AUTH ROUTES ==========
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    if (username === 'admin' && password === 'BlackAngel') {
        req.session.user = { username: 'admin', role: 'admin' };
        return res.json({ success: true, redirect: '/admin.html' });
    }
    const user = users.users.find(u => u.username === username && u.password === password);
    if (user) {
        if (user.banned) return res.json({ success: false, message: 'Account banned.' });
        req.session.user = { username: user.username, role: 'user', email: user.email, premium: user.premium || false };
        res.json({ success: true, redirect: '/dashboard.html' });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/register', (req, res) => {
    const { email, username, password, age, gender, country, number } = req.body;
    const users = readJSON(USERS_FILE);
    if (users.users.find(u => u.username === username)) return res.json({ success: false, message: 'Username exists' });
    const pending = readJSON(PENDING_FILE);
    if (pending.pending.find(p => p.username === username)) return res.json({ success: false, message: 'Already pending' });
    pending.pending.push({ email, username, password, age, gender, country, number, timestamp: Date.now() });
    writeJSON(PENDING_FILE, pending);
    res.json({ success: true, message: 'Registration submitted for admin approval.' });
});

app.get('/api/check-session', (req, res) => {
    if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
    else res.json({ loggedIn: false });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ========== STUBBED ENDPOINTS (no external deps) ==========
app.post('/api/request-qr', (req, res) => res.status(501).json({ error: 'Not available' }));
app.post('/api/request-pairing-code', (req, res) => res.status(501).json({ error: 'Not available' }));
app.post('/api/upload-avatar', (req, res) => res.status(501).json({ error: 'Not available' }));
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

// ========== ACCOUNT UPDATE (real) ==========
app.post('/api/update-profile', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'user') return res.status(401).json({ success: false });
    const { email, age, gender, country, number, oldPassword, newPassword } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.users.find(u => u.username === req.session.user.username);
    if (!user) return res.json({ success: false, message: 'User not found' });
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

app.post('/api/delete-account', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'user') return res.status(401).json({ success: false });
    const username = req.session.user.username;
    const users = readJSON(USERS_FILE);
    const newUsers = users.users.filter(u => u.username !== username);
    if (newUsers.length === users.users.length) return res.json({ success: false });
    users.users = newUsers;
    writeJSON(USERS_FILE, users);
    req.session.destroy(() => res.json({ success: true }));
});

// ========== ADMIN ROUTES ==========
function isAdmin(req, res, next) {
    if (req.session.user?.role === 'admin') next();
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

// ========== SERVE HTML PAGES ==========
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

// Start server
app.listen(PORT, () => {
    console.log(`💀 BlackAngel Web running on port ${PORT}`);
    console.log(`Admin: admin / BlackAngel`);
    console.log(`Test users: test/test, Alpha/Alpha2026, Prince/Prince2026`);
});
