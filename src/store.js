const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.KIDCAMP_DB_PATH || path.join(__dirname, '..', 'data', 'db.json');

const SEED_SESSIONS = [
  {
    id: 'adventure-explorers',
    name: 'Adventure Explorers',
    description: 'Hiking, campfire songs, and outdoor games in the woods.',
    minAge: 7,
    maxAge: 10,
    startDate: '2026-06-15',
    endDate: '2026-06-19',
    price: 175,
    capacity: 20
  },
  {
    id: 'art-and-splash',
    name: 'Art & Splash Studio',
    description: 'Painting, crafts, and water balloon games every afternoon.',
    minAge: 6,
    maxAge: 9,
    startDate: '2026-06-22',
    endDate: '2026-06-26',
    price: 160,
    capacity: 18
  },
  {
    id: 'sports-sampler',
    name: 'Sports Sampler',
    description: 'Try soccer, kickball, and relay races with new friends.',
    minAge: 9,
    maxAge: 13,
    startDate: '2026-07-06',
    endDate: '2026-07-10',
    price: 180,
    capacity: 24
  },
  {
    id: 'builders-workshop',
    name: "Builders' Workshop",
    description: 'Design and build projects out of cardboard, wood, and LEGO bricks.',
    minAge: 10,
    maxAge: 14,
    startDate: '2026-07-13',
    endDate: '2026-07-17',
    price: 190,
    capacity: 16
  },
  {
    id: 'junior-leaders',
    name: 'Junior Leaders',
    description: 'Teamwork challenges and leadership games for older campers.',
    minAge: 12,
    maxAge: 16,
    startDate: '2026-07-20',
    endDate: '2026-07-24',
    price: 200,
    capacity: 20
  }
];

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = { sessions: SEED_SESSIONS, registrations: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getSessions() {
  const db = readDb();
  return db.sessions.map((session) => attachAvailability(session, db.registrations));
}

function getSessionById(sessionId) {
  const db = readDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  return attachAvailability(session, db.registrations);
}

function attachAvailability(session, registrations) {
  const registeredCount = registrations.filter((r) => r.sessionId === session.id).length;
  return {
    ...session,
    spotsFilled: registeredCount,
    spotsLeft: Math.max(session.capacity - registeredCount, 0)
  };
}

function getRegistrations() {
  const db = readDb();
  return db.registrations;
}

function addRegistration(registration) {
  const db = readDb();
  db.registrations.push(registration);
  writeDb(db);
  return registration;
}

function resetDb() {
  const initial = { sessions: SEED_SESSIONS, registrations: [] };
  writeDb(initial);
}

module.exports = {
  DB_PATH,
  getSessions,
  getSessionById,
  getRegistrations,
  addRegistration,
  resetDb
};
