# tratech_examsim

An exam simulation and study platform built for students who want to practice under real exam conditions. The goal was to build something that actually feels like sitting an exam — timed sessions, instant feedback, and a tutor that explains why you got something wrong instead of just telling you the answer.

## Features

- **Exam sessions** — timed practice with MCQ and short-answer questions
- **Jude** — an AI tutor that gives post-answer explanations and answers follow-up questions
- **Performance tracking** — session history and score trends over time
- **Course & topic filtering** — practice specific subjects or go broad
- **Dark/light mode** with customizable accent colors

## Tech Stack

- React 19 + TypeScript
- Vite + Tailwind CSS v4
- Express backend with Prisma + SQLite
- Firebase Auth
- OpenRouter for AI (model: `openai/gpt-4o-mini`)
- Recharts for performance graphs

## Getting Started

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example env file and fill in your keys:
   ```bash
   cp .env.example .env.local
   ```
   Set `OPENROUTER_API_KEY` to your key from [openrouter.ai/keys](https://openrouter.ai/keys).

3. Run the dev server:
   ```bash
   npm run dev
   ```
   App runs at `http://localhost:3000`.

## Project Structure

```
src/
  App.tsx                  # Main app + AI tutor logic
  Admin.tsx                # Admin panel
  types.ts                 # Shared types and mock data
  components/
    MySessionsScreen.tsx
    PerformanceScreen.tsx
    SettingsScreen.tsx
    HelpScreen.tsx
  lib/
    firebase.ts
    AuthContext.tsx
backend/
  server.ts                # Express API + Vite middleware
prisma/
  schema.prisma            # DB schema (SQLite)
```

## Environment Variables

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | Required for AI tutor features |
| `APP_URL` | Base URL of the app (defaults to localhost:3000) |
