import { useEffect, useRef, useState } from "react";
import { getIndexedDocument, streamChat, uploadPdf } from "./api.js";

const MAX_QUESTION = 2000; // matches the backend limit
let nextId = 0;
const uid = () => `m${++nextId}`;

// Highlights inline citations such as [Page 3] or [Pages 3-4] in the answer text.
function AnswerText({ text }) {
  const parts = text.split(/(\[Pages?\s[^\]\n]*\d[^\]\n]*\])/g);
  return parts.map((part, i) =>
    i % 2 ? (
      <span className="cite" key={i}>
        {part}
      </span>
    ) : (
      part
    )
  );
}

function Message({ msg }) {
  if (msg.role === "user") {
    return (
      <div className="row user">
        <div className="bubble">{msg.content}</div>
      </div>
    );
  }
  const waiting = msg.status === "streaming" && !msg.content;
  return (
    <div className="row assistant">
      <div className="answer">
        {waiting && <span className="pulse">Searching the PDF…</span>}
        {msg.content && <AnswerText text={msg.content} />}
        {msg.status === "error" && (
          <div className="error" role="alert">
            {msg.content ? "Answer interrupted: " : ""}
            {msg.error}
          </div>
        )}
        {msg.status === "done" && msg.sources.length > 0 && (
          <div className="sources">Retrieved from page{msg.sources.length > 1 ? "s" : ""} {msg.sources.join(", ")}</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [indexed, setIndexed] = useState(null); // { filename, pages } of the PDF the backend is using
  const [upload, setUpload] = useState({ status: "idle", name: "", error: "" });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false); // synchronous guard against double submits
  const abortRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true); // keep following the stream unless the user scrolled up

  const uploading = upload.status === "uploading";
  const canChat = Boolean(indexed) && !uploading;

  // Pick up a PDF that is already indexed on the backend (e.g. after a page reload).
  useEffect(() => {
    let cancelled = false;
    getIndexedDocument().then((doc) => {
      if (!cancelled && doc) setIndexed((cur) => cur ?? { filename: doc.filename, pages: doc.pages });
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function onScroll() {
    const el = scrollRef.current;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file || uploading || busyRef.current) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setUpload({ status: "error", name: file.name, error: "Please choose a PDF file." });
      return;
    }
    setUpload({ status: "uploading", name: file.name, error: "" });
    try {
      const doc = await uploadPdf(file);
      setIndexed({ filename: doc.filename, pages: doc.pages });
      setMessages([]); // the old conversation was about a different document
      setUpload({ status: "idle", name: "", error: "" });
      inputRef.current?.focus();
    } catch (err) {
      // A failed upload leaves the previously indexed PDF (if any) untouched on the backend.
      setUpload({ status: "error", name: file.name, error: err.message });
    }
  }

  async function send() {
    const question = input.trim();
    if (!question || !canChat || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setInput("");
    stickRef.current = true;

    const botId = uid();
    setMessages((m) => [
      ...m,
      { id: uid(), role: "user", content: question },
      { id: botId, role: "assistant", content: "", sources: [], status: "streaming" },
    ]);
    const patch = (fn) => setMessages((m) => m.map((x) => (x.id === botId ? fn(x) : x)));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(question, {
        signal: ctrl.signal,
        onSources: (sources) => patch((x) => ({ ...x, sources })),
        onToken: (text) => patch((x) => ({ ...x, content: x.content + text })),
      });
      patch((x) => ({ ...x, status: "done" }));
    } catch (err) {
      if (err.name !== "AbortError") patch((x) => ({ ...x, status: "error", error: err.message }));
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

  let status = null;
  if (uploading) status = <span className="pulse">Uploading and indexing {upload.name}…</span>;
  else if (upload.status === "error")
    status = (
      <span className="error">
        {upload.name}: {upload.error}
        {indexed ? ` Still using ${indexed.filename}.` : ""}
      </span>
    );
  else if (indexed)
    status = (
      <span>
        {indexed.filename} · {indexed.pages} page{indexed.pages === 1 ? "" : "s"} · indexed
      </span>
    );
  else status = <span className="muted">No PDF uploaded</span>;

  return (
    <div className="app">
      <header className="header">
        <h1>PDF Chat</h1>
      </header>

      <div className="upload">
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={onFile} />
        <button type="button" className="btn" disabled={uploading || busy} onClick={() => fileRef.current.click()}>
          {indexed ? "Replace PDF" : "Upload PDF"}
        </button>
        <div className="status" role="status" aria-live="polite">
          {status}
        </div>
      </div>

      <main className="chat" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="empty">
            <h2>Chat with your PDF</h2>
            {indexed ? (
              <p>Ask a question about {indexed.filename} below.</p>
            ) : (
              <p>Upload a PDF, wait for it to be indexed, then ask a question about it.</p>
            )}
          </div>
        ) : (
          <div className="thread">
            {messages.map((m) => (
              <Message key={m.id} msg={m} />
            ))}
          </div>
        )}
      </main>

      <footer className="composer">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={MAX_QUESTION}
          disabled={!canChat}
          placeholder={canChat ? "Ask a question… (Enter to send, Shift+Enter for a new line)" : "Upload a PDF to start chatting"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Your question"
        />
        <button type="button" className="btn primary" disabled={!canChat || busy || !input.trim()} onClick={send}>
          Send
        </button>
      </footer>
    </div>
  );
}
