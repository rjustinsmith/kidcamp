# KidCamp Registration

A small Node.js + Express app for registering kids for summer camp sessions.

## What it does

- Lists available camp sessions (name, age range, dates, price, spots left)
- Lets a parent/guardian fill out a registration form for a camper
- Validates the form (required fields, age fits the session, session not full)
- Stores registrations in a local JSON file (`data/db.json`)
- Shows a confirmation message after a successful signup

## Running it

```bash
npm install
npm start
```

Then open http://localhost:3000 in a browser.

For development with auto-restart on file changes:

```bash
npm run dev
```

## Running tests

```bash
npm test
```

Tests use Node's built-in test runner (`node:test`) and `supertest`, and run
against a temporary database file so they never touch `data/db.json`.

## Project layout

```
public/            Front-end (HTML, CSS, vanilla JS)
src/server.js       Express app setup
src/store.js         JSON-file data storage (sessions + registrations)
src/validateRegistration.js  Form validation rules
src/routes/         API route handlers
test/               Automated tests
```

## API

- `GET /api/sessions` — list camp sessions with live availability
- `GET /api/sessions/:id` — get one session
- `GET /api/registrations` — list registrations (name, age, session, time)
- `POST /api/registrations` — submit a new registration
