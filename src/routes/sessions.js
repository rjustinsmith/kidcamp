const express = require('express');
const store = require('../store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ sessions: store.getSessions() });
});

router.get('/:id', (req, res) => {
  const session = store.getSessionById(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Camp session not found.' });
  }
  res.json({ session });
});

module.exports = router;
