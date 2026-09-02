const path = require('path');
const express = require('express');
const sessionsRouter = require('./routes/sessions');
const registrationsRouter = require('./routes/registrations');

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/registrations', registrationsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`KidCamp registration app listening on http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
