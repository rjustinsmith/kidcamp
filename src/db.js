const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'store.json');

const SEED_DATA = {
  sessions: [
    {
      id: 'week1',
      name: 'Adventure Camp - Week 1',
      dates: 'June 15 - June 19',
      activities: 'Hiking, Kayaking, Campfire Skits',
      capacity: 20,
      spotsTaken: 0,
    },
    {
      id: 'week2',
      name: 'Art & Nature Camp - Week 2',
      dates: 'June 22 - June 26',
      activities: 'Painting, Nature Walks, Pottery',
      capacity: 15,
      spotsTaken: 0,
    },
    {
      id: 'week3',
      name: 'Sports & Games Camp - Week 3',
      dates: 'June 29 - July 3',
      activities: 'Soccer, Relay Races, Swimming',
      capacity: 25,
      spotsTaken: 0,
    },
  ],
  registrations: [],
};

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    save(SEED_DATA);
    return structuredClone(SEED_DATA);
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getSessions() {
  return load().sessions;
}

function getSessionById(sessionId) {
  return load().sessions.find((s) => s.id === sessionId) || null;
}

function addRegistration(sessionId, registration) {
  const data = load();
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  if (session.spotsTaken >= session.capacity) {
    throw new Error('Session is full');
  }

  const record = {
    id: crypto.randomUUID(),
    sessionId,
    createdAt: new Date().toISOString(),
    ...registration,
  };

  session.spotsTaken += 1;
  data.registrations.push(record);
  save(data);

  return record;
}

function getRegistrationById(registrationId) {
  return load().registrations.find((r) => r.id === registrationId) || null;
}

module.exports = {
  getSessions,
  getSessionById,
  addRegistration,
  getRegistrationById,
};
