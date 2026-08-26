const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration(body) {
  const errors = [];

  const camperName = (body.camperName || '').trim();
  const camperAge = Number(body.camperAge);
  const parentName = (body.parentName || '').trim();
  const parentEmail = (body.parentEmail || '').trim();
  const emergencyContact = (body.emergencyContact || '').trim();
  const allergies = (body.allergies || '').trim();

  if (!camperName) errors.push("Please enter the camper's name.");
  if (!Number.isInteger(camperAge) || camperAge < 5 || camperAge > 17) {
    errors.push('Camper age must be a number between 5 and 17.');
  }
  if (!parentName) errors.push("Please enter a parent or guardian's name.");
  if (!EMAIL_PATTERN.test(parentEmail)) {
    errors.push('Please enter a valid parent/guardian email address.');
  }
  if (!emergencyContact) {
    errors.push('Please enter an emergency contact phone number.');
  }

  return {
    errors,
    values: {
      camperName,
      camperAge,
      parentName,
      parentEmail,
      emergencyContact,
      allergies,
    },
  };
}

module.exports = { validateRegistration };
