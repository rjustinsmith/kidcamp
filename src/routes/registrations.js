const crypto = require('crypto');
const express = require('express');
const store = require('../store');
const { validateRegistration } = require('../validateRegistration');

const router = express.Router();

router.get('/', (req, res) => {
  const registrations = store.getRegistrations().map((r) => ({
    id: r.id,
    camperName: r.camperName,
    camperAge: r.camperAge,
    sessionId: r.sessionId,
    submittedAt: r.submittedAt
  }));
  res.json({ registrations });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const session = body.sessionId ? store.getSessionById(body.sessionId) : null;

  const { errors, valid } = validateRegistration(body, session);
  if (!valid) {
    return res.status(400).json({ errors });
  }

  const registration = {
    id: crypto.randomUUID(),
    camperName: body.camperName.trim(),
    camperAge: Number(body.camperAge),
    sessionId: session.id,
    sessionName: session.name,
    guardianName: body.guardianName.trim(),
    guardianEmail: body.guardianEmail.trim(),
    guardianPhone: body.guardianPhone.trim(),
    emergencyContactName: body.emergencyContactName.trim(),
    emergencyContactPhone: body.emergencyContactPhone.trim(),
    allergiesOrNotes: (body.allergiesOrNotes || '').trim(),
    waiverAgreed: true,
    submittedAt: new Date().toISOString()
  };

  store.addRegistration(registration);

  res.status(201).json({
    confirmation: {
      id: registration.id,
      camperName: registration.camperName,
      sessionName: registration.sessionName,
      startDate: session.startDate,
      endDate: session.endDate
    }
  });
});

module.exports = router;
