# Nova AI Assistant

A standalone, Android-friendly AI chat website built with Node.js and Express. This project is independent; it does not import or change any other Nova project.

## Features
- Responsive mobile-first chat UI
- Multi-turn conversation while the page remains open
- Voice input when supported by the browser
- Optional text-to-speech for replies
- Server-side API key handling (the key is never placed in browser code)
- Health endpoint for hosting checks

## Run locally
1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Put your provider key in `.env` as `OPENAI_API_KEY=your_key_here`.
6. Run `npm start`.
7. Open `http://localhost:3000`.

## Deploy to Render
Create/use the Render service for this Nova AI Assistant repository only.

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `OPENAI_API_KEY` (required for actual AI replies)
- Optional environment variable: `OPENAI_MODEL` (defaults to `gpt-4o-mini`)

Do not put real API keys in `index.html`, commit them to GitHub, or share them in chat. Provider usage may cost money. A working deployment requires a valid API key with access to the selected model.

## Current limitations
This version implements AI text chat, browser voice input, and spoken replies. Image generation, video generation, image/file understanding, user accounts, and saved cloud chats are not connected yet; the app does not pretend these features are working.
