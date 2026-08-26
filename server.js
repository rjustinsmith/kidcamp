const express = require('express');
const path = require('path');
const db = require('./src/db');
const { validateRegistration } = require('./src/validate');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('home', { sessions: db.getSessions() });
});

app.get('/register/:sessionId', (req, res) => {
  const session = db.getSessionById(req.params.sessionId);
  if (!session) {
    return res.status(404).render('not-found');
  }
  res.render('register', {
    session,
    errors: [],
    values: {},
  });
});

app.post('/register/:sessionId', (req, res) => {
  const session = db.getSessionById(req.params.sessionId);
  if (!session) {
    return res.status(404).render('not-found');
  }

  const { errors, values } = validateRegistration(req.body);

  if (session.spotsTaken >= session.capacity) {
    errors.push('Sorry, this session just filled up.');
  }

  if (errors.length > 0) {
    return res.status(400).render('register', { session, errors, values });
  }

  const registration = db.addRegistration(session.id, values);
  res.redirect(`/confirmation/${registration.id}`);
});

app.get('/confirmation/:registrationId', (req, res) => {
  const registration = db.getRegistrationById(req.params.registrationId);
  if (!registration) {
    return res.status(404).render('not-found');
  }
  const session = db.getSessionById(registration.sessionId);
  res.render('confirmation', { registration, session });
});

app.listen(PORT, () => {
  console.log(`Kid Camp registration app running at http://localhost:${PORT}`);
});
