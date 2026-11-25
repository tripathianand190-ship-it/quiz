# Quiz Board

An online engineering quiz app with a Node.js backend and a leaderboard.

- **Topics:** Engineering Mechanics, Electrical Basics, Programming Fundamentals, Math for Engineers (8 questions each in the bank; add more in `data/questions.json`)
- **Backend:** zero-dependency Node.js (18+), no `npm install` needed
- **Answers are checked on the server**, so they never reach the browser before you answer
- **Leaderboard:** top 10 per topic, saved in `DATA_DIR/scores.json`

## Run locally

```bash
node server.js
# open http://localhost:3000
```

Run the smoke test with `node test.js`.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/topics` | List topics |
| POST | `/api/start` `{topic}` | Start a quiz, returns questions without answers |
| POST | `/api/answer` `{session,id,choice}` | Check one answer |
| POST | `/api/finish` `{session,name}` | Finish and save score |
| GET | `/api/leaderboard?topic=` | Top 10 scores |
| GET | `/api/health` | Health check |

## Add questions

Edit `data/questions.json`. Each question is `{"q": "...", "o": [4 options], "a": index_of_correct_option, "n": "explanation"}`.

## Deploy

This app needs a host that runs Node.js (GitHub Pages cannot run the backend).

**Render:** New → Web Service → connect this repo. Build command: leave empty. Start command: `node server.js`. A free instance works, but its disk is wiped on every restart, so scores reset. For permanent scores, add a persistent disk (paid) and set `DATA_DIR` to its mount path (see `render.yaml`).

**Railway / Fly.io / any VPS:** run `node server.js`, or use the included `Dockerfile` and mount a volume at `/data`.

**Custom domain:** add it in your host's dashboard, then create the DNS record it shows at your domain registrar. HTTPS is automatic.

**Environment variables:** `PORT` (set by most hosts), `DATA_DIR` (where scores are stored).

## Limits

Scores are stored in a JSON file, which is fine for a small project. For many users, move storage to a database such as Postgres or Supabase.
