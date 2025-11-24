const Database = require('better-sqlite3');
const db = new Database('contacts.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO contacts (name, phone, message) VALUES
    ('Mom', '+15551112222', 'Mom I need help NOW → {location} {situation}'),
    ('Partner', '+15553334444', 'BABE COME GET ME → {location} {situation} CALL 911'),
    ('Friend', '+15555556666', 'EMERGENCY → {location} {situation} Help fast');
`);

console.log('Database created: contacts.db');
console.log('Default contacts added');
db.close();