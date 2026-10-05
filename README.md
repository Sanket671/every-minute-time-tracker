# Every Minute Daily Time Tracker

A lightweight personal time-accountability tracker for recording daily activities as contiguous time slots.

## Features

- One open slot at a time
- Server-side time chaining for start and duration calculation
- MongoDB + Mongoose persistence when configured
- In-memory fallback for local testing without MongoDB
- React + Vite frontend, Express API, simple dashboard
- Optional `APP_ACCESS_KEY` gating

## Local setup

1. Copy `.env.example` to `.env` and fill values.
2. Install server dependencies:
   `npm install`
3. Install frontend dependencies:
   `npm --prefix client install`
4. Start the app:
   `npm run dev`

## Production build

```bash
npm install
npm --prefix client install --include=dev
npm run build
npm start
```

## Environment variables

- `MONGODB_URI` optional MongoDB connection string
- `DAY_START` default `08:00`
- `DAY_END` default `20:00`
- `TIMEZONE` default `Asia/Kolkata`
- `APP_ACCESS_KEY` optional access key
- `PORT` optional default `5000`

## Render

The repository includes a `render.yaml` configuration for a single web service.
