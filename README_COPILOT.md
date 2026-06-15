# AI Campaign Copilot — Usage

This repository includes an AI Campaign Copilot that uses Gemini to plan multi-step campaigns from a natural language prompt and provides a revenue prediction.

Quick start

1. Set environment variables (create `backend/.env` or set them in your environment):

GEMINI_API_KEY — required: your Google Gemini API key

Example `.env`:

GEMINI_API_KEY=YOUR_KEY_HERE

2. Install Python deps and run the backend (from `backend/`):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

3. Start the frontend (from `frontend/`):

```bash
npm install
npm run dev
```

How to use the Copilot

- In the Campaigns page click the `Copilot` button.
- Enter a plain-English goal, for example:
  "Bring back customers inactive for 60 days and recover ₹50,000."
- Click "Generate Plan". The Copilot will:
  - Use Gemini to generate a 3-step campaign plan and reasoning cards.
  - Persist the campaign as a draft in the database.
  - Compute a revenue prediction and estimated reach per step.
- You can then open the new campaign in Mission Control, review, and launch.

Troubleshooting

- If you see a 503 error mentioning Gemini API key, ensure `GEMINI_API_KEY` is set in the backend environment.
- If Gemini responses are slow, increase request timeouts or test with a small prompt.

Security & Notes

- The current implementation persists the AI plan immediately as a draft. If you prefer a preview-only workflow, consider changing `/api/agent/copilot` to return an unsaved preview and persist only on explicit confirmation.
- Gemini client calls require network access and valid credentials; be careful storing secrets in shared environments.
