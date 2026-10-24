import { useEffect, useMemo, useRef, useState } from "react";
import { getIndexedDocument, streamChat, uploadPdf } from "./api.js";
import StudyMode from "./StudyMode.jsx";

const MAX_QUESTION = 2000;
let nextId = 0;
const uid = () => `m${++nextId}`;

// Highlights inline citations such as [Page 3] or [Pages 3-4]
function AnswerText({ text }) {
  const parts = useMemo(
    () => text.split(/(\[Pages?\s[^\]\n]*\d[^\]\n]*\])/g),
    [text]
  );
  return parts.map((part, i) =>
    i % 2 ? (
      <span className="cite-badge" key={i}>
        {part}
      </span>
    ) : (
      part
    )
  );
}

// Collapsible thinking block for models with reasoning (Qwen 3.5, DeepSeek R1, etc.)
function ThinkingBlock({ thinking, isStreaming, onStop }) {
  const [open, setOpen] = useState(false);

  if (!thinking) return null;

  return (
    <div className="thinking-block">
      <div className="thinking-header">
        <button
          type="button"
          className="thinking-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <span className="thinking-icon">💭</span>
          <span className="thinking-title">
            {isStreaming ? "Thinking through response…" : "Thought process"}
          </span>
          <span className={`thinking-chevron ${open ? "open" : ""}`}>▾</span>
        </button>
        {isStreaming && onStop && (
          <button
            type="button"
            className="btn-inline-stop"
            onClick={(e) => {
              e.stopPropagation();
              onStop();
            }}
            title="Stop generation to change your question"
            aria-label="Stop generation"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2.5" />
            </svg>
            <span>Stop</span>
          </button>
        )}
      </div>
      {open && <pre className="thinking-content">{thinking}</pre>}
    </div>
  );
}

function Message({ msg, onStop, onEditPrompt, isLatestAssistant, isBusy, lastQuestion }) {
  if (msg.role === "user") {
    return (
      <div className="row user">
        <div className="user-message-wrapper">
          <button
            type="button"
            className="btn-edit-user-msg"
            onClick={() => onEditPrompt?.(msg.content)}
            title="Edit and ask again"
            aria-label="Edit and ask again"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <div className="bubble user-bubble">{msg.content}</div>
        </div>
      </div>
    );
  }

  const isInitialWait = msg.status === "streaming" && !msg.content && !msg.thinking;

  return (
    <div className="row assistant">
      <div className="assistant-card">
        {msg.thinking && (
          <ThinkingBlock
            thinking={msg.thinking}
            isStreaming={msg.status === "streaming" && !msg.content}
            onStop={isBusy && isLatestAssistant ? onStop : null}
          />
        )}
        {isInitialWait && (
          <div className="loading-state">
            <span className="pulse-dot"></span>
            <span className="pulse-text">Reviewing document and formulating response…</span>
            {isBusy && isLatestAssistant && (
              <button
                type="button"
                className="btn-inline-stop"
                onClick={onStop}
                title="Stop generation to change your question"
                aria-label="Stop generation"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2.5" />
                </svg>
                <span>Stop</span>
              </button>
            )}
          </div>
        )}
        {msg.content && (
          <div className="answer-text">
            <AnswerText text={msg.content} />
          </div>
        )}
        {msg.status === "paused" && (
          <div className="paused-banner" role="status">
            <div className="paused-info">
              <span className="paused-badge">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2.5" />
                </svg>
                Stopped
              </span>
              <span>Generation stopped. Want to change what you asked?</span>
            </div>
            {(msg.prompt || lastQuestion) && (
              <button
                type="button"
                className="pill-action-btn edit-prompt-btn"
                onClick={() => onEditPrompt?.(msg.prompt || lastQuestion)}
              >
                Edit question
              </button>
            )}
          </div>
        )}
        {msg.status === "error" && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <span>{msg.content ? "Answer interrupted: " : ""}{msg.error}</span>
          </div>
        )}
        {msg.status === "done" && msg.sources && msg.sources.length > 0 && (
          <div className="sources-container">
            <span className="sources-label">Sources:</span>
            {msg.sources.map((page) => (
              <span className="source-tag" key={page}>
                Page {page}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("chat");
  const [indexed, setIndexed] = useState(null);
  const [upload, setUpload] = useState({ status: "idle", name: "", error: "" });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);
  const abortRef = useRef(null);
  const lastQuestionRef = useRef("");
  const activeBotIdRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);

  const uploading = upload.status === "uploading";
  const canChat = Boolean(indexed) && !uploading;

  // Pick up previously indexed PDF on mount
  useEffect(() => {
    let cancelled = false;
    getIndexedDocument().then((doc) => {
      if (!cancelled && doc) {
        setIndexed((cur) => cur ?? { filename: doc.filename, pages: doc.pages });
      }
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  // Smooth auto-scroll following new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Dynamic textarea expansion
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }

  async function handleFile(file) {
    if (!file || uploading || busyRef.current) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setUpload({ status: "error", name: file.name, error: "Please choose a valid PDF file." });
      return;
    }
    setUpload({ status: "uploading", name: file.name, error: "" });
    try {
      const doc = await uploadPdf(file);
      setIndexed({ filename: doc.filename, pages: doc.pages });
      setMessages([]);
      setUpload({ status: "idle", name: "", error: "" });
      inputRef.current?.focus();
    } catch (err) {
      setUpload({ status: "error", name: file.name, error: err.message });
    }
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (activeBotIdRef.current) {
      setMessages((m) =>
        m.map((x) =>
          x.id === activeBotIdRef.current && x.status === "streaming"
            ? { ...x, status: "paused" }
            : x
        )
      );
    }
    busyRef.current = false;
    setBusy(false);

    // In case the person wants to change what he needs to ask:
    // Restore the prompt into the input field and focus
    if (lastQuestionRef.current) {
      setInput(lastQuestionRef.current);
    }
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  const handlePause = handleStop;

  function handleEditPrompt(promptText) {
    if (!promptText) return;
    setInput(promptText);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  async function send() {
    const question = input.trim();
    if (!question || !canChat || busyRef.current) return;

    lastQuestionRef.current = question;
    busyRef.current = true;
    setBusy(true);
    setInput("");
    stickRef.current = true;

    const botId = uid();
    activeBotIdRef.current = botId;

    setMessages((m) => [
      ...m,
      { id: uid(), role: "user", content: question },
      {
        id: botId,
        role: "assistant",
        prompt: question,
        content: "",
        thinking: "",
        sources: [],
        status: "streaming",
      },
    ]);

    const patch = (fn) => setMessages((m) => m.map((x) => (x.id === botId ? fn(x) : x)));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(question, {
        signal: ctrl.signal,
        onSources: (sources) => patch((x) => ({ ...x, sources })),
        onThinking: (chunk) => patch((x) => ({ ...x, thinking: (x.thinking || "") + chunk })),
        onToken: (text) => patch((x) => ({ ...x, content: (x.content || "") + text })),
      });
      patch((x) => ({ ...x, status: "done" }));
    } catch (err) {
      if (err.name === "AbortError") {
        patch((x) => ({ ...x, status: "paused" }));
      } else {
        patch((x) => ({ ...x, status: "error", error: err.message }));
      }
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  const latestAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="layout">
      {/* Header spanning full width */}
      <header className="brand-header">
        <div className="brand-content">
          <div className="brand-logo-badge">
            <span className="logo-symbol">✦</span>
          </div>
          <div className="brand-titles">
            <h1 className="brand-name">PDF Chat</h1>
            <p className="brand-caption">
              {mode === "study" ? "Flashcards from a PDF or PowerPoint" : "Chat with your PDF"}
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="mode-switch" role="group" aria-label="Mode">
            <button type="button" aria-pressed={mode === "chat"} onClick={() => setMode("chat")}>
              Chat
            </button>
            <button type="button" aria-pressed={mode === "study"} onClick={() => setMode("study")}>
              Study
            </button>
          </div>
          {mode === "chat" && indexed && (
            <div className="header-status-pill" title={`Active: ${indexed.filename}`}>
              <span className="status-dot online"></span>
              <span className="status-filename">{indexed.filename}</span>
              <span className="status-pages">{indexed.pages}p</span>
            </div>
          )}
        </div>
      </header>

      {mode === "study" ? (
        <main className="chat-container">
          <StudyMode />
        </main>
      ) : (
        <main className="chat-container" ref={scrollRef} onScroll={onScroll}>
          {messages.length === 0 ? (
            <div className="empty-hero">
              <div className="hero-icon-wrapper">
                <span className="hero-icon">📄</span>
              </div>
              <h2 className="hero-title">Welcome to PDF Chat</h2>
              <p className="hero-subtitle">
                {indexed
                  ? `Ready to discuss ${indexed.filename}. Ask questions, request summaries, or extract key insights.`
                  : "Attach a PDF below to start extracting answers and citations instantly."}
              </p>

              {indexed ? (
                <div className="suggested-prompts">
                  <button
                    type="button"
                    className="prompt-chip"
                    onClick={() => {
                      setInput("Can you give a brief summary of this document?");
                      inputRef.current?.focus();
                    }}
                  >
                    "Summarize this document"
                  </button>
                  <button
                    type="button"
                    className="prompt-chip"
                    onClick={() => {
                      setInput("What are the key points and conclusions?");
                      inputRef.current?.focus();
                    }}
                  >
                    "What are the main conclusions?"
                  </button>
                  <button
                    type="button"
                    className="prompt-chip"
                    onClick={() => {
                      setInput("What are the primary recommendations or findings?");
                      inputRef.current?.focus();
                    }}
                  >
                    "Key findings & details"
                  </button>
                </div>
              ) : (
                <div className="hero-cta">
                  <button
                    type="button"
                    className="btn-hero-attach"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <span className="btn-icon">📎</span> Choose a PDF
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="messages-thread">
              {messages.map((m) => (
                <Message
                  key={m.id}
                  msg={m}
                  onStop={handleStop}
                  onEditPrompt={handleEditPrompt}
                  isBusy={busy}
                  isLatestAssistant={m.id === latestAssistantId}
                  lastQuestion={lastQuestionRef.current}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {mode === "chat" && (
        <footer className="composer-container">
          <div className="composer-card">
            {/* Document Attachment Banner */}
            {(indexed || uploading || upload.status === "error") && (
              <div className="attached-banner">
                {uploading ? (
                  <div className="upload-pill in-progress">
                    <span className="spinner-mini"></span>
                    <span>Indexing {upload.name}…</span>
                  </div>
                ) : upload.status === "error" ? (
                  <div className="upload-pill error">
                    <span>⚠️ {upload.error}</span>
                    <button
                      type="button"
                      className="pill-action-btn"
                      onClick={() => fileRef.current?.click()}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="upload-pill active">
                    <span className="pdf-badge">PDF</span>
                    <span className="doc-name" title={indexed.filename}>
                      {indexed.filename}
                    </span>
                    <span className="doc-meta">({indexed.pages} pages)</span>
                    <button
                      type="button"
                      className="pill-action-btn"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading || busy}
                      title="Choose a different PDF to replace current index"
                    >
                      Replace
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Input & Action Bar */}
            <div className="composer-row">
              {/* Hidden native file input */}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={onFileChange}
              />

              {/* Attachment Button */}
              <button
                type="button"
                className={`btn-attach ${indexed ? "has-doc" : ""}`}
                disabled={uploading || busy}
                onClick={() => fileRef.current?.click()}
                title={indexed ? "Replace PDF" : "Attach PDF"}
                aria-label={indexed ? "Replace PDF" : "Attach PDF"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              {/* Textarea */}
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MAX_QUESTION}
                disabled={!canChat}
                placeholder={
                  canChat
                    ? busy
                      ? "Model is thinking... Click ■ to stop and change your question"
                      : "Ask a question about your PDF..."
                    : "Attach a PDF to start chatting..."
                }
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Your question"
              />

              {/* Action Button: Stop (square icon like other AI agents) while busy, Send when idle */}
              {busy ? (
                <button
                  type="button"
                  className="btn-stop"
                  onClick={handleStop}
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2.5" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-send"
                  disabled={!canChat || !input.trim()}
                  onClick={send}
                  title="Send message"
                  aria-label="Send message"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
