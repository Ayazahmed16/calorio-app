# Calorio frontend (React)

A separate single-page app that talks to the Calorio backend through its JSON API (`/api/v1/`).
Built with React, Vite, React Router, TanStack Query and Tailwind CSS.

## Pages in this app
Landing, Login / Sign up, Dashboard, Meals (list, edit, delete), Add Meal (builder), Saved Meals, Activity, Weight,
Analytics, Foods, Recipes (+ detail), Goals, Calculator, Account (profile, password, CSV export/import, API token) and
Connections (Fitbit, Telegram, email, notifications).

## Run locally
```
cd frontend
npm install
cp .env.example .env        # then set VITE_API_URL (use http://127.0.0.1:8000 for a local backend)
npm run dev                 # http://localhost:5173
```
Start the backend in another terminal (`python manage.py runserver`). In development the backend already allows
`http://localhost:5173` for CORS.

## Build
```
npm run build               # output in dist/
npm run preview
```

## Configuration (environment variables, set at build time)
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL, no trailing slash. Required in production. |
| `VITE_CLASSIC_URL` | Optional: base URL for links to pages that are not in the React app yet (defaults to `VITE_API_URL`). |

## Deploy to Vercel
1. Import the GitHub repo in Vercel and set **Root Directory** to `frontend`.
2. Framework preset: Vite (build `npm run build`, output `dist`).
3. Add `VITE_API_URL` (your Render backend URL) under Settings, Environment Variables.
4. Deploy, then set `FRONTEND_URL` on the backend (Render) to the resulting Vercel URL. That allows the app to call the API and makes the old Django pages redirect to it.

`vercel.json` rewrites every path to `index.html` so deep links and refreshes work.

## How auth works
`POST /api/v1/auth/login/` returns a token that is stored in `localStorage` and sent as `Authorization: Token <key>`.
A 401 from any call signs the user out. Logging out rotates the token on the server.

## Fitbit
Register `<backend URL>/api/v1/connections/fitbit/callback/` as the redirect URL in your Fitbit app. The login runs through the
backend and sends the browser back to `/connections` here.
