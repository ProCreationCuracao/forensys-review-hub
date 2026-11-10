# ForenSys Review Hub

Database and logins: **Supabase** (project "Evaluation"). Hosting: **Vercel** (team Anexxt).

## Run on this Mac
```
pnpm install
pnpm dev          # then open http://localhost:3000
```
Settings are in `.env.local` (keep this file private — it contains the database login).

## Publish / update the online version
```
bash deploy.sh
```
The first time it asks you to log in to Vercel. After that, run it again whenever the app changes.

## Users (management only)
1. Supabase → Authentication → Users → **Add user → Create new user** (email + password, tick *Auto Confirm User*).
2. In the app → **Access** → add the same email with a role (HR admin or Manager).
The first person who ever signs in becomes HR admin automatically.
