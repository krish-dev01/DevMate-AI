const express = require("express");
const cors = require("cors");

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "127.0.0.1";
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120000;
const MAX_QUESTION_LENGTH = 8000;
const MAX_HISTORY_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_HISTORY_LENGTH = 48000;

const configuredOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function isAllowedOrigin(origin) {
  if (configuredOrigins.has(origin)) return true;

  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error("This origin is not allowed to access the local DevMate API."));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json({ limit: "512kb" }));

app.get("/", (req, res) => {
  res.send("DevMate AI backend is running.");
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "DevMate AI backend is running." });
});

app.get("/api/health/ollama", async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      return res.status(503).json({
        success: false,
        message: `Ollama returned HTTP ${response.status}. Check that the local Ollama service is running.`,
      });
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const modelAvailable = models.some((model) => model.name === OLLAMA_MODEL || model.model === OLLAMA_MODEL);

    res.json({
      success: true,
      ollama: "connected",
      model: OLLAMA_MODEL,
      modelAvailable,
      message: modelAvailable
        ? `Ollama is connected and ${OLLAMA_MODEL} is available.`
        : `Ollama is connected, but ${OLLAMA_MODEL} is not installed. Run: ollama pull ${OLLAMA_MODEL}`,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: error.name === "AbortError"
        ? "Ollama did not respond to the health check within 5 seconds."
        : "Could not reach Ollama. Start Ollama and try again.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.post("/api/ai/ask", async (req, res) => {
  const { question, history = [] } = req.body || {};

  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ success: false, message: "Please provide a question." });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return res.status(413).json({ success: false, message: `Questions must be ${MAX_QUESTION_LENGTH} characters or fewer.` });
  }
  if (!Array.isArray(history)) {
    return res.status(400).json({ success: false, message: "Conversation history must be an array." });
  }
  if (history.length > MAX_HISTORY_MESSAGES) {
    return res.status(413).json({ success: false, message: `Conversation history is limited to ${MAX_HISTORY_MESSAGES} messages.` });
  }

  let historyLength = 0;
  for (const message of history) {
    if (
      !message ||
      typeof message !== "object" ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Each history item must contain a non-empty user or assistant message.",
      });
    }
    if (message.content.length > MAX_MESSAGE_LENGTH) {
      return res.status(413).json({ success: false, message: "A conversation message is too long." });
    }
    historyLength += message.content.length;
    if (historyLength > MAX_HISTORY_LENGTH) {
      return res.status(413).json({ success: false, message: "Conversation history is too large. Start a new conversation." });
    }
  }

  const messages = [
    {
      role: "system",
      content:
        "You are DevMate AI, a helpful programming assistant. Use the supplied conversation history to understand follow-up questions and answer the latest user question. Stay on the current topic unless the user changes it. Explain programming concepts clearly and provide accurate, practical examples. If the request is ambiguous, ask a focused clarification.",
    },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: "user", content: question.trim() },
  ];

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", abortOnDisconnect);

  try {
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: { num_predict: 1536 },
      }),
      signal: controller.signal,
    });

    if (!ollamaResponse.ok) {
      if (ollamaResponse.status === 404) {
        return res.status(503).json({
          success: false,
          message: `The local model ${OLLAMA_MODEL} was not found. Run: ollama pull ${OLLAMA_MODEL}`,
        });
      }
      return res.status(502).json({
        success: false,
        message: `Ollama could not complete the request (HTTP ${ollamaResponse.status}). Please retry.`,
      });
    }

    let data;
    try {
      data = await ollamaResponse.json();
    } catch {
      return res.status(502).json({ success: false, message: "Ollama returned invalid JSON. Please retry." });
    }

    const answer = data?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return res.status(502).json({ success: false, message: "Ollama returned an empty or unexpected response." });
    }
    if (answer.length > MAX_MESSAGE_LENGTH) {
      return res.status(502).json({ success: false, message: "Ollama's response was too long to save safely. Please retry with a more focused question." });
    }

    return res.json({ success: true, question: question.trim(), answer: answer.trim() });
  } catch (error) {
    if (res.destroyed || !res.writable) return undefined;
    if (timedOut) {
      return res.status(504).json({
        success: false,
        message: "Ollama took too long to respond. You can retry the saved question.",
      });
    }
    if (controller.signal.aborted) return undefined;

    console.error(`AI request failed (${error.name || "Error"}).`);
    return res.status(503).json({
      success: false,
      message: "Could not reach Ollama. Start the local Ollama service and confirm the model is installed.",
    });
  } finally {
    clearTimeout(timeout);
    res.off("close", abortOnDisconnect);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request body is too large." });
  }
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ success: false, message: "Request body must be valid JSON." });
  }
  if (error.message?.includes("origin is not allowed")) {
    return res.status(403).json({ success: false, message: "This origin is not allowed to access the local DevMate API." });
  }
  console.error(`Backend request failed (${error.name || "Error"}).`);
  return res.status(500).json({ success: false, message: "The backend could not process this request." });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`DevMate AI backend listening on http://${HOST}:${PORT}`);
    console.log(`Local model: ${OLLAMA_MODEL} via ${OLLAMA_URL}`);
  });
}

module.exports = app;
