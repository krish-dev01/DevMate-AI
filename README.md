# DevMate AI

DevMate AI is a local-first programming assistant. The React/Vite frontend sends chat requests to a small Express API, which calls Ollama on the same machine. Conversations are stored in the browser's local storage; no paid cloud AI API is used.

## Requirements

- Node.js 20.19 or newer (or Node.js 22.12 or newer) and npm.
- [Ollama](https://ollama.com/download) installed and running locally.
- The `qwen2.5:3b` model downloaded in Ollama.

Download the model once:

```sh
ollama pull qwen2.5:3b
```

## Install and run

From the project root, install both sets of dependencies:

```sh
npm install
npm --prefix frontend install
```

Start Ollama, then run the backend and frontend in separate terminals:

```sh
npm start
```

```sh
npm --prefix frontend run dev
```

Vite prints the address it selected, usually `http://localhost:5173`. The API listens on `http://127.0.0.1:5000` by default. To use another frontend address for the API, create `frontend/.env.local` and set `VITE_API_URL=http://localhost:5000` (or the backend URL you configured).

Useful checks:

```sh
npm test
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Configuration

The backend reads these optional environment variables:

- `PORT`: API port, default `5000`.
- `HOST`: bind address, default `127.0.0.1` so the API is not exposed to the network.
- `OLLAMA_URL`: Ollama base URL, default `http://127.0.0.1:11434`.
- `OLLAMA_MODEL`: model name, default `qwen2.5:3b`.
- `OLLAMA_TIMEOUT_MS`: request timeout, default `120000`.
- `FRONTEND_ORIGINS`: comma-separated additional frontend origins. Localhost origins are allowed for Vite development.

The frontend reads `VITE_API_URL` at build/start time and defaults to `http://localhost:5000`.

## API

- `GET /`: backend welcome message.
- `GET /api/health`: confirms the Express API is running.
- `GET /api/health/ollama`: checks the Ollama service and whether the configured model is installed.
- `POST /api/ai/ask`: accepts `{ "question": "...", "history": [{ "role": "user" | "assistant", "content": "..." }] }` and returns `{ "success": true, "question": "...", "answer": "..." }`.

The API accepts at most 8,000 characters per question and 40 history messages (up to 48,000 total history characters). Only user and assistant history roles are accepted; the trusted system prompt is created by the backend.

## Project layout

- `server.js`: Express API, request validation, Ollama integration, and health endpoints.
- `frontend/src/App.jsx`: chat interface and conversation lifecycle.
- `frontend/src/App.css` and `frontend/src/index.css`: light, responsive Gemini-inspired DevMate workspace styles.
- `frontend/vite.config.js`: Vite configuration.

## Troubleshooting

- **Could not reach Ollama:** start the Ollama application/service and open `http://localhost:5000/api/health/ollama` to inspect connectivity.
- **Model not found:** run `ollama pull qwen2.5:3b`, or set `OLLAMA_MODEL` to a model already installed.
- **Frontend cannot reach the API:** ensure `npm start` is running, check `VITE_API_URL`, and use a localhost frontend address.
- **Vite uses another port:** open the exact URL Vite prints; local development origins are allowed by the backend.
- **Conversation is missing in another browser/device:** chat history is stored only in that browser's local storage and is not synchronized.

## Known limitations

- Ollama inference speed and answer quality depend on the local machine and model. Follow-up understanding can vary.
- There is no account, cloud sync, or cross-device conversation storage.
- Requests that exceed the backend history limits should be continued in a new conversation.
