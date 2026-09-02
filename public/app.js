const sessionsListEl = document.getElementById('sessions-list');
const formSectionEl = document.getElementById('form-section');
const confirmationSectionEl = document.getElementById('confirmation-section');
const confirmationTextEl = document.getElementById('confirmation-text');
const form = document.getElementById('registration-form');
const sessionIdInput = document.getElementById('sessionId');
const formMessageEl = document.getElementById('form-message');
const submitButton = document.getElementById('submit-button');

let sessions = [];

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    sessions = data.sessions;
    renderSessions();
  } catch (err) {
    sessionsListEl.innerHTML = '<p>Sorry, we could not load camp sessions. Please refresh the page.</p>';
  }
}

function renderSessions() {
  if (sessions.length === 0) {
    sessionsListEl.innerHTML = '<p>No camp sessions are available right now.</p>';
    return;
  }

  sessionsListEl.innerHTML = '';
  sessions.forEach((session) => {
    const card = document.createElement('div');
    const isFull = session.spotsLeft <= 0;
    card.className = 'session-card' + (isFull ? ' full' : '');
    card.dataset.sessionId = session.id;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', isFull ? '-1' : '0');

    const spotsClass = session.spotsLeft <= 3 && !isFull ? 'spots-left low' : 'spots-left';

    card.innerHTML = `
      <h3>${session.name}</h3>
      <p>${session.description}</p>
      <p class="session-meta">Ages ${session.minAge}-${session.maxAge}</p>
      <p class="session-meta">${session.startDate} to ${session.endDate}</p>
      <p class="session-meta">$${session.price}</p>
      <p class="${spotsClass}">${isFull ? 'Full' : `${session.spotsLeft} spots left`}</p>
    `;

    if (!isFull) {
      card.addEventListener('click', () => selectSession(session.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectSession(session.id);
        }
      });
    }

    sessionsListEl.appendChild(card);
  });
}

function selectSession(id) {
  sessionIdInput.value = id;
  document.querySelectorAll('.session-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.sessionId === id);
  });
  clearFieldError('sessionId');
  formSectionEl.scrollIntoView({ behavior: 'smooth' });
}

function clearAllErrors() {
  document.querySelectorAll('.error').forEach((el) => {
    el.textContent = '';
  });
  formMessageEl.textContent = '';
  formMessageEl.classList.remove('error-message');
}

function clearFieldError(field) {
  const el = document.querySelector(`[data-error-for="${field}"]`);
  if (el) el.textContent = '';
}

function showErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const el = document.querySelector(`[data-error-for="${field}"]`);
    if (el) {
      el.textContent = message;
    } else if (field === 'sessionId') {
      formMessageEl.textContent = message;
      formMessageEl.classList.add('error-message');
    }
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAllErrors();

  if (!sessionIdInput.value) {
    formMessageEl.textContent = 'Please choose a camp session above.';
    formMessageEl.classList.add('error-message');
    return;
  }

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.waiverAgreed = document.getElementById('waiverAgreed').checked;

  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showErrors(data.errors || {});
      return;
    }

    showConfirmation(data.confirmation);
  } catch (err) {
    formMessageEl.textContent = 'Something went wrong. Please try again.';
    formMessageEl.classList.add('error-message');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit Registration';
  }
});

function showConfirmation(confirmation) {
  formSectionEl.hidden = true;
  document.getElementById('sessions-section').hidden = true;
  confirmationSectionEl.hidden = false;
  confirmationTextEl.textContent =
    `${confirmation.camperName} is registered for ${confirmation.sessionName} ` +
    `(${confirmation.startDate} to ${confirmation.endDate}). ` +
    `A confirmation number is ${confirmation.id}.`;
}

document.getElementById('register-another').addEventListener('click', () => {
  form.reset();
  sessionIdInput.value = '';
  clearAllErrors();
  document.querySelectorAll('.session-card').forEach((card) => card.classList.remove('selected'));
  confirmationSectionEl.hidden = true;
  document.getElementById('sessions-section').hidden = false;
  formSectionEl.hidden = false;
  loadSessions();
});

loadSessions();
