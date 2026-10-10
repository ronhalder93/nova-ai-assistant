# Nova AI — fresh standalone project

This folder is a new project and does not modify or import code from any older Nova projects.

## Included now
- Mobile-friendly chat interface
- Multi-turn chat history during the current chat
- Voice input (browser support required)
- Optional text-to-speech for replies
- File selection UI (currently adds filenames to the prompt; it does not upload/analyse file contents)
- Server-side API key handling

## Connect the chat model
1. Install Node.js 18 or newer.
2. In this folder run `npm install`.
3. Copy `.env.example` to `.env`.
4. Put your provider API key in `OPENAI_API_KEY` in `.env`; never put it in the HTML.
5. Run `npm start`, then open `http://localhost:3000`.

Chat needs a valid API key and network access. API usage may cost money depending on the provider/account.

## Not connected yet
Image generation, video generation, image/file understanding, accounts, and saved chats are not implemented in this starter. They must be added with real provider endpoints and credentials; the interface does not pretend they already work.

## Deploy
This Node app can be deployed as a new service on Render with build command `npm install`, start command `npm start`, and `OPENAI_API_KEY` / `OPENAI_MODEL` configured in the service's environment. Use a NEW repository and NEW Render service; do not reuse any old Nova project.
