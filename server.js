require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();

// CORS MUST BE FIRST — BEFORE ANY ROUTES OR STATIC
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Serve static files (index.html, style.css, etc.)
app.use(express.static(path.join(__dirname)));

// Database
const db = new Database('contacts.db', { verbose: console.log });
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    message TEXT
  )
`);

// Twilio
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Routes
app.get('/api/contacts', (req, res) => {
  const contacts = db.prepare('SELECT id, name, phone, message FROM contacts ORDER BY id').all();
  res.json(contacts);
});

app.post('/api/contacts', (req, res) => {
  const { name, phone, message } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });

  try {
    db.prepare('INSERT OR REPLACE INTO contacts (name, phone, message) VALUES (?, ?, ?)')
      .run(name, phone, message || 'Help → {location} {situation}');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/contacts/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/sms', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Missing to or message' });

  try {
    const msg = await client.messages.create({
      body: message + '\n\n— Guardian Angel 2025',
      from: FROM_NUMBER,
      to
    });
    console.log('SMS sent:', msg.sid);
    res.json({ success: true, sid: msg.sid });
  } catch (e) {
    console.error('SMS failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Guardian Angel Server RUNNING`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Open index.html with Live Server → http://127.0.0.1:5500`);
  console.log(`CORS is FIXED — all origins allowed`);
});