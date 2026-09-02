const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9()+\-.\s]{7,20}$/;

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Validates a registration submission against a camp session.
 * Returns { errors } where errors is a field-name -> message map (empty if valid).
 */
function validateRegistration(body, session) {
  const errors = {};

  if (isBlank(body.camperName)) {
    errors.camperName = 'Please enter the camper\'s name.';
  }

  const age = Number(body.camperAge);
  if (!Number.isInteger(age) || age <= 0) {
    errors.camperAge = 'Please enter a valid age.';
  } else if (session && (age < session.minAge || age > session.maxAge)) {
    errors.camperAge = `This session is for ages ${session.minAge}-${session.maxAge}.`;
  }

  if (isBlank(body.guardianName)) {
    errors.guardianName = 'Please enter a parent or guardian name.';
  }

  if (isBlank(body.guardianEmail) || !EMAIL_PATTERN.test(body.guardianEmail.trim())) {
    errors.guardianEmail = 'Please enter a valid email address.';
  }

  if (isBlank(body.guardianPhone) || !PHONE_PATTERN.test(body.guardianPhone.trim())) {
    errors.guardianPhone = 'Please enter a valid phone number.';
  }

  if (isBlank(body.emergencyContactName)) {
    errors.emergencyContactName = 'Please enter an emergency contact name.';
  }

  if (isBlank(body.emergencyContactPhone) || !PHONE_PATTERN.test(body.emergencyContactPhone.trim())) {
    errors.emergencyContactPhone = 'Please enter a valid emergency contact phone number.';
  }

  if (isBlank(body.sessionId)) {
    errors.sessionId = 'Please choose a camp session.';
  } else if (!session) {
    errors.sessionId = 'That camp session could not be found.';
  } else if (session.spotsLeft <= 0) {
    errors.sessionId = 'That camp session is full. Please choose another session.';
  }

  if (body.waiverAgreed !== true && body.waiverAgreed !== 'true' && body.waiverAgreed !== 'on') {
    errors.waiverAgreed = 'A parent or guardian must agree to the camp waiver.';
  }

  return { errors, valid: Object.keys(errors).length === 0 };
}

module.exports = { validateRegistration };
