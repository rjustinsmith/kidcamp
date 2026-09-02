const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDbPath = path.join(os.tmpdir(), `kidcamp-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
process.env.KIDCAMP_DB_PATH = tmpDbPath;

const { createApp } = require('../src/server');
const store = require('../src/store');
const supertest = require('supertest');

test.beforeEach(() => {
  store.resetDb();
});

test.after(() => {
  if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
});

test('GET /api/sessions returns seeded sessions with availability', async () => {
  const app = createApp();
  const res = await supertest(app).get('/api/sessions');

  assert.equal(res.status, 200);
  assert.ok(res.body.sessions.length > 0);
  const first = res.body.sessions[0];
  assert.ok('spotsLeft' in first);
  assert.equal(first.spotsLeft, first.capacity);
});

test('POST /api/registrations succeeds with valid data', async () => {
  const app = createApp();
  const sessionsRes = await supertest(app).get('/api/sessions');
  const session = sessionsRes.body.sessions[0];
  const validAge = session.minAge;

  const res = await supertest(app)
    .post('/api/registrations')
    .send({
      sessionId: session.id,
      camperName: 'Riley Chen',
      camperAge: validAge,
      guardianName: 'Sam Chen',
      guardianEmail: 'sam.chen@example.com',
      guardianPhone: '555-123-4567',
      emergencyContactName: 'Jordan Chen',
      emergencyContactPhone: '555-987-6543',
      allergiesOrNotes: 'None',
      waiverAgreed: true
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.confirmation.camperName, 'Riley Chen');
  assert.equal(res.body.confirmation.sessionName, session.name);

  const afterRes = await supertest(app).get(`/api/sessions/${session.id}`);
  assert.equal(afterRes.body.session.spotsLeft, session.spotsLeft - 1);
});

test('POST /api/registrations rejects missing required fields', async () => {
  const app = createApp();
  const sessionsRes = await supertest(app).get('/api/sessions');
  const session = sessionsRes.body.sessions[0];

  const res = await supertest(app)
    .post('/api/registrations')
    .send({ sessionId: session.id });

  assert.equal(res.status, 400);
  assert.ok(res.body.errors.camperName);
  assert.ok(res.body.errors.guardianName);
  assert.ok(res.body.errors.waiverAgreed);
});

test('POST /api/registrations rejects camper age outside session range', async () => {
  const app = createApp();
  const sessionsRes = await supertest(app).get('/api/sessions');
  const session = sessionsRes.body.sessions[0];

  const res = await supertest(app)
    .post('/api/registrations')
    .send({
      sessionId: session.id,
      camperName: 'Too Young Camper',
      camperAge: session.minAge - 1,
      guardianName: 'Sam Chen',
      guardianEmail: 'sam.chen@example.com',
      guardianPhone: '555-123-4567',
      emergencyContactName: 'Jordan Chen',
      emergencyContactPhone: '555-987-6543',
      waiverAgreed: true
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.errors.camperAge);
});

test('POST /api/registrations rejects registration when session is full', async () => {
  const app = createApp();
  const sessionsRes = await supertest(app).get('/api/sessions');
  const session = sessionsRes.body.sessions.find((s) => s.id === 'builders-workshop');

  const basePayload = {
    sessionId: session.id,
    camperAge: session.minAge,
    guardianName: 'Sam Chen',
    guardianEmail: 'sam.chen@example.com',
    guardianPhone: '555-123-4567',
    emergencyContactName: 'Jordan Chen',
    emergencyContactPhone: '555-987-6543',
    waiverAgreed: true
  };

  for (let i = 0; i < session.capacity; i++) {
    const res = await supertest(app)
      .post('/api/registrations')
      .send({ ...basePayload, camperName: `Camper ${i}` });
    assert.equal(res.status, 201);
  }

  const overflowRes = await supertest(app)
    .post('/api/registrations')
    .send({ ...basePayload, camperName: 'One Too Many' });

  assert.equal(overflowRes.status, 400);
  assert.ok(overflowRes.body.errors.sessionId);
});
