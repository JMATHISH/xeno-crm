# Deployment Guide — Brew & Co CRM

This guide covers deploying the frontend (Vite) to Vercel and the backend (FastAPI) to Render. It also explains required environment variables and troubleshooting steps.

## Environment variables
Add these to your hosting platform (Vercel / Render / GitHub Secrets):

- GEMINI_API_KEY=
- SMTP_HOST=
- SMTP_PORT=
- SMTP_USERNAME=
- SMTP_PASSWORD=
- SMTP_FROM_EMAIL=
- DATABASE_URL= (e.g., sqlite:///./brew_crm.db or a Postgres URL for production)
- VITE_API_URL= (frontend runtime value pointing to backend API)
- FRONTEND_URL= (used by backend CORS)

## Frontend — Vercel
1. Connect your GitHub repo to Vercel.
2. Set environment variable `VITE_API_URL` to your Render app URL (e.g. `https://brew-crm-backend.onrender.com`).
3. Build & Output settings: default Vite build (Vercel detects Node.js).
4. Deploy.

Notes:
- Vite exposes env variables prefixed with `VITE_`. Ensure you use `VITE_API_URL`.
- If you test locally, create a `.env` in `frontend/` with:
  VITE_API_URL=http://localhost:8000

## Backend — Render
1. Create a new Web Service on Render and connect your repository.
2. Use `render.yaml` or manual settings.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Set environment variables listed above in Render.

## Database
- By default the project uses SQLite (DATABASE_URL=sqlite:///./brew_crm.db). For production, consider using Postgres and updating `DATABASE_URL`.
- The backend runs `Base.metadata.create_all(bind=engine)` at startup to initialize DB schema for SQLite.

## Troubleshooting
- 503 or CORS errors: ensure `VITE_API_URL` in Vercel and `FRONTEND_URL` in Render are set and match the actual frontend origin.
- Dependency failures: ensure `requirements.txt` contains all needed packages. For optional features (ReportLab, Twilio, Gemini), ensure keys and packages installed.
- Gemini issues: set `GEMINI_API_KEY` in Render.

## Local testing
- Backend:
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --reload

- Frontend:
  cd frontend
  npm install
  VITE_API_URL=http://localhost:8000 npm run dev

