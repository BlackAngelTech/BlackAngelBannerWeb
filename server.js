const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'blackangel_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set true if HTTPS
}));

// Data files
const USERS_FILE = path.join(__dirname, 'users.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');
const ACTIVE_SESSIONS_FILE = path.join(__dirname, 'connectedUsers.json');

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
// AUTH MIDDLEWARE
// ===============================
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// ===============================
// API ROUTES (public)
// ===============================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    // Admin login with password "BlackAngel"
    if (username === 'admin' && password === 'BlackAngel') {
        req.session.user = { username: 'admin', role: 'admin' };
        return res.json({ success: true, redirect: '/admin.html' });
    }
    const user = users.users.find(u => u.username === username && u.password === password);
    if (user) {
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
        return res.json({ success: false, message: 'Username already exists' });
    }
    const pending = readJSON(PENDING_FILE);
    if (pending.pending.find(p => p.username === username)) {
        return res.json({ success: false, message: 'Already pending approval' });
    }
    const newUser = { email, username, password, age, gender, country, number, timestamp: Date.now() };
    pending.pending.push(newUser);
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
// ADMIN API (protected)
// ===============================
app.get('/api/admin/pending', isAdmin, (req, res) => {
    const pending = readJSON(PENDING_FILE);
    res.json(pending.pending);
});

app.post('/api/admin/approve', isAdmin, (req, res) => {
    const { username } = req.body;
    const pending = readJSON(PENDING_FILE);
    const index = pending.pending.findIndex(u => u.username === username);
    if (index === -1) return res.json({ success: false, message: 'User not found' });
    const approvedUser = pending.pending[index];
    const users = readJSON(USERS_FILE);
    users.users.push({
        ...approvedUser,
        approvedAt: Date.now(),
        banned: false,
        premium: false
    });
    writeJSON(USERS_FILE, users);
    pending.pending.splice(index, 1);
    writeJSON(PENDING_FILE, pending);
    res.json({ success: true });
});

app.post('/api/admin/decline', isAdmin, (req, res) => {
    const { username } = req.body;
    const pending = readJSON(PENDING_FILE);
    const index = pending.pending.findIndex(u => u.username === username);
    if (index === -1) return res.json({ success: false, message: 'User not found' });
    pending.pending.splice(index, 1);
    writeJSON(PENDING_FILE, pending);
    res.json({ success: true });
});

app.get('/api/admin/users', isAdmin, (req, res) => {
    const users = readJSON(USERS_FILE);
    const activeSessions = readJSON(ACTIVE_SESSIONS_FILE);
    const enriched = users.users.map(u => ({
        ...u,
        password: undefined,
        active: !!activeSessions[u.username]
    }));
    res.json(enriched);
});

app.post('/api/admin/ban', isAdmin, (req, res) => {
    const { username } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User not found' });
    user.banned = true;
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.post('/api/admin/unban', isAdmin, (req, res) => {
    const { username } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User not found' });
    user.banned = false;
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.post('/api/admin/premium', isAdmin, (req, res) => {
    const { username, premium } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User not found' });
    user.premium = premium;
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.post('/api/admin/delete', isAdmin, (req, res) => {
    const { username } = req.body;
    let users = readJSON(USERS_FILE);
    const newUsers = users.users.filter(u => u.username !== username);
    if (newUsers.length === users.users.length) return res.json({ success: false, message: 'User not found' });
    users.users = newUsers;
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.get('/api/admin/sessions', isAdmin, (req, res) => {
    const sessions = readJSON(ACTIVE_SESSIONS_FILE);
    res.json(sessions);
});

// Serve admin page (only if admin logged in)
app.get('/admin.html', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.redirect('/index.html');
    }
});

// Dashboard placeholder – you can create later
app.get('/dashboard.html', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.redirect('/index.html');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`💀 BlackAngel Web running on port ${PORT}`);
});
