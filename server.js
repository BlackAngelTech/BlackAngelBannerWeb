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
    secret: 'deathnote_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set true if HTTPS
}));

// Data files
const USERS_FILE = path.join(__dirname, 'users.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');

function ensureFiles() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
    }
    if (!fs.existsSync(PENDING_FILE)) {
        fs.writeFileSync(PENDING_FILE, JSON.stringify({ pending: [] }, null, 2));
    }
}
ensureFiles();

// Helper to read/write JSON
function readJSON(file) {
    return JSON.parse(fs.readFileSync(file));
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===============================
// API ROUTES
// ===============================

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.users.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.user = { username: user.username, email: user.email };
        res.json({ success: true, redirect: '/dashboard.html' });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

// Register
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

// Check session
app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Pending users (admin only – simple placeholder)
app.get('/api/pending', (req, res) => {
    if (!req.session.user) return res.json({ error: 'Not logged in' });
    const pending = readJSON(PENDING_FILE);
    res.json(pending);
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`💀 DeathNote Web running on port ${PORT}`);
});
