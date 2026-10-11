# Nova AI Assistant

Mobile-friendly AI chat web app built with Node.js and Express.

## Features currently implemented
- Responsive chat interface with multi-turn context while the page is open
- Browser speech recognition where supported
- Image-generation mode through Cloudflare Workers AI, with Pollinations as fallback
- `/api/health` endpoint to report provider configuration
- API keys kept on the server, not in browser JavaScript
- Basic text/CSV/JSON/Markdown attachment reading; PDF and image understanding are not implemented yet

## Run locally
1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add your provider credentials.
4. Run `npm start` and open `http://localhost:3000`.

## Environment variables
- `OPENROUTER_API_KEY` — required for chat replies; server uses the OpenRouter chat completions API.
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` — preferred image provider. The token needs Workers AI permission.
- `POLLINATIONS_API_KEY` — optional image-provider key used when Cloudflare credentials are not set.
- `PORT` — optional; defaults to `3000`.

## Deploy to Render
Use build command `npm install` and start command `npm start`. Add secrets through Render's Environment settings; never commit real keys. A successful deployment still depends on valid provider credentials and quotas.

## Current limitations
Cloud chats/accounts, video generation, PDF text extraction, and image/file vision are not implemented. Image generation and chat depend on upstream provider availability, credentials, and usage limits. The `/api/health` endpoint checks configuration presence, not whether provider credentials actually work.
