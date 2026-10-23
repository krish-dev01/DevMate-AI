import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5000"
    : "https://devmate-ai-backend-dn7r.onrender.com")
).replace(/\/$/, "");

const STORAGE_KEY = "devmate-conversations";
const ACTIVE_CHAT_KEY = "devmate-active-chat";
const MAX_QUESTION_LENGTH = 8000;
const MAX_TITLE_LENGTH = 60;
const MAX_HISTORY_MESSAGES = 40;
const MAX_HISTORY_LENGTH = 48000;
const MAX_MESSAGE_LENGTH = 12000;
const EMPTY_MESSAGES = [];

function DevMateLogo({ className = "" }) {
  return (
    <span className={`devmate-logo ${className}`} aria-hidden="true">
      <svg viewBox="0 0 36 36" focusable="false">
        <path d="M10 9.5h8a9 9 0 0 1 0 18h-8z" />
        <path d="M27 4.5c.7 3 2.2 4.5 5.2 5.2-3 .7-4.5 2.2-5.2 5.2-.7-3-2.2-4.5-5.2-5.2 3-.7 4.5-2.2 5.2-5.2z" />
      </svg>
    </span>
  );
}

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  };

  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    chat: <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.3-.7L4 20l1.7-4.2A7.5 7.5 0 1 1 20 11.5Z" />,
    edit: <><path d="m15 5 4 4" /><path d="M4 20l4.3-.9L19 8.4 15.6 5 4.9 15.7 4 20Z" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="m6 7 .7 13h10.6L18 7M9 7V4h6v3" /></>,
    arrow: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
    bulb: <><path d="M9 18h6M10 22h4M8.2 14.5a6 6 0 1 1 7.6 0c-.9.7-1.3 1.5-1.4 2.5h-4.8c-.1-1-.5-1.8-1.4-2.5Z" /></>,
    bug: <><path d="M8 9h8v8a4 4 0 0 1-8 0V9ZM9 5l3 3 3-3M5 12h3M16 12h3M5 17h3M16 17h3" /><path d="M12 12v6" /></>,
    wand: <><path d="m5 19 10-10M14 5l.7 2.3L17 8l-2.3.7L14 11l-.7-2.3L11 8l2.3-.7L14 5ZM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6L19 13Z" /></>,
  };

  return <svg {...common}>{paths[name] || null}</svg>;
}

function prepareHistory(messages) {
  const selected = [];
  let totalLength = 0;

  for (const message of messages.slice(-MAX_HISTORY_MESSAGES).reverse()) {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > MAX_MESSAGE_LENGTH ||
      totalLength + message.content.length > MAX_HISTORY_LENGTH
    ) {
      break;
    }
    selected.push({ role: message.role, content: message.content });
    totalLength += message.content.length;
  }

  return selected.reverse();
}

function createConversation() {
  return {
    id: crypto.randomUUID(),
    title: "New Conversation",
    titleIsCustom: false,
    messages: [],
    updatedAt: Date.now(),
  };
}

function getConversationTitle(messages) {
  const firstQuestion = messages.find((message) => message.role === "user");
  const title = firstQuestion?.content.trim() || "New Conversation";
  return title.length > 48 ? `${title.slice(0, 47).trimEnd()}…` : title;
}

function normalizeConversations(value) {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set();
  return value.flatMap((chat) => {
    if (!chat || typeof chat.id !== "string" || !chat.id || seenIds.has(chat.id)) {
      return [];
    }

    const messages = Array.isArray(chat.messages)
      ? chat.messages.filter(
          (message) =>
            message &&
            ["user", "assistant"].includes(message.role) &&
            typeof message.content === "string",
        )
      : [];

    if (messages.length === 0) return [];

    seenIds.add(chat.id);
    const generatedTitle = getConversationTitle(messages);
    const storedTitle = typeof chat.title === "string" ? chat.title.trim() : "";
    const title = (storedTitle || generatedTitle).slice(0, MAX_TITLE_LENGTH);

    return [
      {
        id: chat.id,
        title,
        titleIsCustom:
          chat.titleIsCustom === true ||
          (chat.titleIsCustom !== false && title !== generatedTitle),
        messages,
        updatedAt:
          Number.isFinite(chat.updatedAt) && chat.updatedAt > 0
            ? chat.updatedAt
            : Date.now(),
      },
    ];
  });
}

function loadInitialState() {
  let conversations = [];
  let storedActiveId = null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    conversations = normalizeConversations(stored ? JSON.parse(stored) : []);
    storedActiveId = localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch (error) {
    console.error("Could not load conversations from browser storage.", error);
  }

  const activeConversation =
    conversations.find((chat) => chat.id === storedActiveId) ||
    conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (activeConversation) {
    return {
      conversations,
      activeChatId: activeConversation.id,
      draftChat: null,
    };
  }

  const draftChat = createConversation();
  return { conversations, activeChatId: draftChat.id, draftChat };
}

function App() {
  const [initialState] = useState(loadInitialState);
  const [conversations, setConversations] = useState(initialState.conversations);
  const [activeChatId, setActiveChatId] = useState(initialState.activeChatId);
  const [draftChat, setDraftChat] = useState(initialState.draftChat);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryRequests, setRetryRequests] = useState({});
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [copiedTarget, setCopiedTarget] = useState("");

  const requestControllerRef = useRef(null);
  const cancelDeleteRef = useRef(null);
  const newChatButtonRef = useRef(null);
  const chatScrollRef = useRef(null);

  const activeConversation =
    conversations.find((chat) => chat.id === activeChatId) ||
    (draftChat?.id === activeChatId ? draftChat : null);
  const messages = activeConversation?.messages || EMPTY_MESSAGES;
  const savedConversations = conversations
    .filter((chat) => chat.messages.length > 0)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (storageError) {
      console.error("Could not save conversations to browser storage.", storageError);
    }
  }, [conversations]);

  useEffect(() => {
    try {
      if (activeChatId) localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
      else localStorage.removeItem(ACTIVE_CHAT_KEY);
    } catch (storageError) {
      console.error("Could not save the active conversation ID.", storageError);
    }
  }, [activeChatId]);

  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (chatScroll) chatScroll.scrollTop = chatScroll.scrollHeight;
  }, [activeChatId, messages, loading, error, notice]);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!deleteTarget) return undefined;

    const previousFocus = document.activeElement;
    const fallbackFocus = newChatButtonRef.current;
    cancelDeleteRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDeleteTarget(null);
      if (event.key === "Tab") {
        const buttons = document.querySelectorAll(".delete-dialog button:not(:disabled)");
        const firstButton = buttons[0];
        const lastButton = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === firstButton) {
          event.preventDefault();
          lastButton?.focus();
        } else if (!event.shiftKey && document.activeElement === lastButton) {
          event.preventDefault();
          firstButton?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus?.();
      else fallbackFocus?.focus();
    };
  }, [deleteTarget]);

  function clearFeedback() {
    setError("");
    setNotice("");
  }

  function startNewConversation() {
    if (requestControllerRef.current) return;
    if (draftChat && activeChatId === draftChat.id) {
      setQuestion("");
      clearFeedback();
      setRenamingChatId(null);
      return;
    }

    const newDraft = createConversation();
    setDraftChat(newDraft);
    setActiveChatId(newDraft.id);
    setQuestion("");
    clearFeedback();
    setRenamingChatId(null);
  }

  function openConversation(chatId) {
    if (requestControllerRef.current) return;
    setActiveChatId(chatId);
    setQuestion("");
    clearFeedback();
    setRenamingChatId(null);
  }

  function updateSavedConversation(chatId, updateFunction) {
    setConversations((previous) =>
      previous.map((chat) =>
        chat.id === chatId
          ? { ...updateFunction(chat), updatedAt: Date.now() }
          : chat,
      ),
    );
  }

  function startRenaming(chat) {
    if (requestControllerRef.current) return;
    setRenamingChatId(chat.id);
    setRenameTitle(chat.title);
    clearFeedback();
  }

  function saveRename(chatId) {
    const cleanedTitle = renameTitle.trim();
    if (!cleanedTitle) {
      setError("Conversation title cannot be empty.");
      return;
    }

    updateSavedConversation(chatId, (chat) => ({
      ...chat,
      title: cleanedTitle.slice(0, MAX_TITLE_LENGTH),
      titleIsCustom: true,
    }));
    setRenamingChatId(null);
    setRenameTitle("");
    clearFeedback();
  }

  function cancelRename() {
    setRenamingChatId(null);
    setRenameTitle("");
    clearFeedback();
  }

  function requestDelete(chat) {
    if (requestControllerRef.current) return;
    setDeleteTarget(chat);
    clearFeedback();
  }

  function confirmDelete() {
    if (!deleteTarget || requestControllerRef.current) return;

    const deletedId = deleteTarget.id;
    const remaining = savedConversations.filter((chat) => chat.id !== deletedId);
    setConversations((previous) => previous.filter((chat) => chat.id !== deletedId));
    setDeleteTarget(null);
    setRetryRequests((current) => {
      const next = { ...current };
      delete next[deletedId];
      return next;
    });

    if (activeChatId === deletedId) {
      if (remaining.length > 0) {
        setActiveChatId(remaining[0].id);
        setDraftChat(null);
      } else {
        const newDraft = createConversation();
        setDraftChat(newDraft);
        setActiveChatId(newDraft.id);
      }
      setQuestion("");
    }

    setError("");
    setNotice("Conversation deleted.");
  }

  async function runQuestion({ chatId, currentQuestion, history }) {
    if (requestControllerRef.current) return;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/api/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ question: currentQuestion, history }),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The backend returned an unreadable response. Please retry.");
      }

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || `The backend request failed (${response.status}).`);
      }
      if (typeof data.answer !== "string" || !data.answer.trim()) {
        throw new Error("The local model returned an empty response. Please retry.");
      }

      updateSavedConversation(chatId, (chat) => ({
        ...chat,
        messages: [...chat.messages, { role: "assistant", content: data.answer.trim() }],
      }));
      setRetryRequests((previous) => {
        const next = { ...previous };
        delete next[chatId];
        return next;
      });
    } catch (requestError) {
      const wasCancelled = requestError.name === "AbortError";
      setError(
        wasCancelled
          ? "Generation stopped. Your question is saved and can be retried."
          : requestError instanceof TypeError
            ? `Could not reach the DevMate backend at ${API_URL}. Start the backend and check Ollama.`
            : requestError.message || "Could not get a response from the local AI.",
      );
      setRetryRequests((previous) => ({
        ...previous,
        [chatId]: { chatId, question: currentQuestion, history },
      }));
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  function askAI() {
    const currentQuestion = question.trim();
    if (
      !currentQuestion ||
      currentQuestion.length > MAX_QUESTION_LENGTH ||
      requestControllerRef.current ||
      !activeConversation
    ) {
      return;
    }

    const chatId = activeConversation.id;
    const history = prepareHistory(activeConversation.messages);
    const userMessage = { role: "user", content: currentQuestion };
    const isDraft = draftChat?.id === chatId;

    if (isDraft) {
      const savedChat = {
        ...draftChat,
        title: getConversationTitle([userMessage]),
        titleIsCustom: false,
        messages: [userMessage],
        updatedAt: Date.now(),
      };
      setConversations((previous) => [savedChat, ...previous.filter((chat) => chat.id !== chatId)]);
      setDraftChat(null);
    } else {
      updateSavedConversation(chatId, (chat) => ({
        ...chat,
        messages: [...chat.messages, userMessage],
      }));
    }

    setQuestion("");
    setRetryRequests((previous) => {
      const next = { ...previous };
      delete next[chatId];
      return next;
    });
    void runQuestion({ chatId, currentQuestion, history });
  }

  function retryLastRequest() {
    const retryRequest = retryRequests[activeChatId];
    if (!retryRequest || retryRequest.chatId !== activeChatId || requestControllerRef.current) return;
    void runQuestion({
      chatId: retryRequest.chatId,
      currentQuestion: retryRequest.question,
      history: retryRequest.history,
    });
  }

  function stopGeneration() {
    requestControllerRef.current?.abort();
  }

  async function copyText(text, target) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      window.setTimeout(() => setCopiedTarget((current) => current === target ? "" : current), 1800);
    } catch {
      setCopiedTarget(`failed:${target}`);
      window.setTimeout(() => setCopiedTarget((current) => current === `failed:${target}` ? "" : current), 2200);
    }
  }

  function renderMarkdown(message) {
    return (
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre({ children }) {
              const codeElement = Array.isArray(children) ? children[0] : children;
              const codeText = String(codeElement?.props?.children ?? "");
              const codeTarget = `code:${codeText}`;
              const copied = copiedTarget === codeTarget;
              const failed = copiedTarget === `failed:${codeTarget}`;
              return (
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button code-copy-button"
                    onClick={() => void copyText(codeText, codeTarget)}
                    aria-label="Copy code block"
                  >
                    {copied ? "Copied" : failed ? "Copy failed" : "Copy code"}
                  </button>
                  <pre>{children}</pre>
                </div>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    );
  }

  const visibleRetry = Boolean(retryRequests[activeChatId]);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Conversation sidebar">
        <div className="sidebar-brand">
          <DevMateLogo />
          <div>
            <h2>DevMate</h2>
            <span>AI coding companion</span>
          </div>
        </div>
        <button ref={newChatButtonRef} className="new-chat" onClick={startNewConversation} disabled={loading}>
          <Icon name="plus" size={19} />
          <span>New chat</span>
        </button>

        <div className="conversation-list" aria-label="Saved conversations">
          <p className="conversation-list-title">RECENT CONVERSATIONS</p>
          {savedConversations.length === 0 && (
            <p className="empty-history">No saved conversations yet. Start a chat to see it here.</p>
          )}

          {savedConversations.map((chat) => (
            <div
              key={chat.id}
              className={`conversation-item-wrapper ${chat.id === activeChatId ? "selected" : ""}`}
            >
              {renamingChatId === chat.id ? (
                <form
                  className="rename-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveRename(chat.id);
                  }}
                >
                  <input
                    className="rename-input"
                    value={renameTitle}
                    onChange={(event) => setRenameTitle(event.target.value)}
                    maxLength={MAX_TITLE_LENGTH}
                    autoFocus
                    aria-label="New conversation title"
                  />
                  <div className="rename-actions">
                    <button type="submit" title="Save title" aria-label="Save title">Save</button>
                    <button type="button" onClick={cancelRename} title="Cancel renaming">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    className={`conversation-item ${chat.id === activeChatId ? "selected" : ""}`}
                    onClick={() => openConversation(chat.id)}
                    disabled={loading}
                    title={chat.title}
                    aria-current={chat.id === activeChatId ? "page" : undefined}
                  >
                    <Icon name="chat" size={17} />
                    <span className="conversation-title">{chat.title}</span>
                  </button>
                  <div className="conversation-actions">
                    <button
                      className="rename-button"
                      onClick={() => startRenaming(chat)}
                      disabled={loading}
                      title="Rename conversation"
                      aria-label={`Rename ${chat.title}`}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => requestDelete(chat)}
                      disabled={loading}
                      title="Delete conversation"
                      aria-label={`Delete ${chat.title}`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-footer-dot" aria-hidden="true" />
          <span>Local model</span>
          <span className="model-name">Qwen 2.5</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h3>DevMate AI</h3>
            <span>Local coding assistant</span>
          </div>
          <div className="status"><span aria-hidden="true" /> Running locally</div>
        </header>

        <section className="workspace" aria-label="Chat workspace">
          <div
            className={`chat-scroll-region ${messages.length === 0 ? "is-empty" : ""}`}
            ref={chatScrollRef}
          >
          {messages.length === 0 && (
            <div className="welcome">
              <DevMateLogo className="hero-mark" />
              <p className="welcome-eyebrow">YOUR LOCAL CODING COMPANION</p>
              <h1>What can I help you build?</h1>
              <p>Ask a question, share an error, or explore a new idea.</p>
            </div>
          )}

          {messages.length > 0 && (
            <div className="conversation" aria-live="polite">
              {messages.map((message, index) => (
                <article
                  key={`${activeChatId}-${index}`}
                  className={`answer-card ${message.role === "user" ? "user-message" : "ai-message"}`}
                >
                  <div className="message-heading">
                    <div className="message-identity">
                      {message.role === "assistant" ? (
                        <DevMateLogo className="message-logo" />
                      ) : (
                        <span className="you-avatar" aria-hidden="true">Y</span>
                      )}
                      <div>
                        <h3>{message.role === "user" ? "You" : "DevMate"}</h3>
                        {message.role === "assistant" && <span className="message-meta">Local AI</span>}
                      </div>
                    </div>
                    {message.role === "assistant" && (() => {
                      const responseTarget = `response:${activeChatId}:${index}`;
                      return (
                        <button
                          type="button"
                          className="copy-button response-copy-button"
                          onClick={() => void copyText(message.content, responseTarget)}
                        >
                          {copiedTarget === responseTarget
                            ? "Copied response"
                            : copiedTarget === `failed:${responseTarget}`
                              ? "Copy failed"
                              : "Copy response"}
                        </button>
                      );
                    })()}
                  </div>
                  {message.role === "user" ? <p>{message.content}</p> : renderMarkdown(message, index)}
                </article>
              ))}
            </div>
          )}

          {loading && (
            <div className="answer-card ai-message loading-card" role="status" aria-live="polite">
              <div className="message-identity">
                <DevMateLogo className="message-logo" />
                <div>
                  <h3>DevMate</h3>
                  <span className="message-meta">Local AI</span>
                </div>
              </div>
              <p><span className="loading-dot" /> Thinking through your question…</p>
            </div>
          )}

          {(error || visibleRetry) && (
            <div className="feedback-card error-card" role="alert">
              <p>{error || "This question did not receive a response."}</p>
              {visibleRetry && !loading && (
                <button type="button" className="text-button" onClick={retryLastRequest}>Retry request</button>
              )}
            </div>
          )}
          {notice && <div className="feedback-card notice-card" role="status">{notice}</div>}

          {messages.length === 0 && (
            <div className="suggestions">
              <p>TRY A STARTER</p>
              <div className="suggestion-grid">
                <button onClick={() => setQuestion("Explain the difference between let and const in JavaScript.")}>
                  <Icon name="bulb" size={19} />
                  <span><strong>Explain a concept</strong><small>let vs. const in JavaScript</small></span>
                </button>
                <button onClick={() => setQuestion("How can I debug a React component?")}>
                  <Icon name="bug" size={19} />
                  <span><strong>Help me debug</strong><small>Trace a React component issue</small></span>
                </button>
                <button onClick={() => setQuestion("Give me suggestions to improve my code.")}>
                  <Icon name="wand" size={19} />
                  <span><strong>Improve my code</strong><small>Get ideas for a code review</small></span>
                </button>
              </div>
            </div>
          )}

          <div className="input-card">
            <label className="visually-hidden" htmlFor="question">What are you working on?</label>
            <textarea
              id="question"
              placeholder="Ask DevMate anything about code..."
              value={question}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                  event.preventDefault();
                  askAI();
                }
              }}
            />
            <div className="input-footer">
              <span>{loading ? "Qwen is thinking…" : "Enter to send · Shift+Enter for a new line"}</span>
              <button
                className={`send-button ${loading ? "is-loading" : ""}`}
                onClick={loading ? stopGeneration : askAI}
                disabled={!loading && !question.trim()}
                aria-label={loading ? "Stop generating" : "Send message"}
                title={loading ? "Stop generating" : "Send message"}
              >
                {loading ? <span className="stop-square" aria-hidden="true" /> : <Icon name="arrow" size={19} />}
              </button>
            </div>
          </div>
          </div>
        </section>

        <footer className="footer">DevMate AI · Built for developers, powered by local AI</footer>
      </main>

      {deleteTarget && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDeleteTarget(null);
        }}>
          <section
            className="delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
          >
            <h2 id="delete-dialog-title">Delete conversation?</h2>
            <p id="delete-dialog-description">
              “{deleteTarget.title}” will be permanently removed from this browser.
            </p>
            <div className="dialog-actions">
              <button ref={cancelDeleteRef} type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="danger-button" onClick={confirmDelete}>Delete conversation</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
