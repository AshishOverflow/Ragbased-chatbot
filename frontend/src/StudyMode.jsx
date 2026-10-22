import { useEffect, useRef, useState } from "react";
import { generateFlashcards } from "./api.js";

const COUNTS = [8, 12, 16];

function isStudyFile(file) {
  return /\.(pdf|pptx)$/i.test(file?.name || "");
}

export default function StudyMode() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [count, setCount] = useState(12);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [deck, setDeck] = useState(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const card = deck?.cards?.[index];
  const loading = status === "loading";

  function chooseFile(next) {
    if (!next) return;
    if (!isStudyFile(next)) {
      setFile(null);
      setDeck(null);
      setStatus("error");
      setError("Choose a PDF or a PowerPoint file (.pptx).");
      return;
    }
    setFile(next);
    setDeck(null);
    setError("");
    setStatus("idle");
    setIndex(0);
    setFlipped(false);
  }

  function onFileChange(e) {
    const next = e.target.files?.[0];
    e.target.value = "";
    if (next) chooseFile(next);
  }

  function go(step) {
    if (!deck?.cards?.length) return;
    setIndex((i) => (i + step + deck.cards.length) % deck.cards.length);
    setFlipped(false);
  }

  async function generate() {
    if (!file || loading) return;
    setStatus("loading");
    setError("");
    setFlipped(false);
    try {
      const result = await generateFlashcards(file, count);
      if (!result?.cards?.length) {
        throw new Error("No flashcards were generated. Try a document with more text.");
      }
      setDeck(result);
      setIndex(0);
      setStatus("ready");
    } catch (err) {
      setDeck(null);
      setStatus("error");
      setError(err.message);
    }
  }

  useEffect(() => {
    const total = deck?.cards?.length ?? 0;
    function onKey(e) {
      if (status !== "ready" || total === 0) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((open) => !open);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1) % total);
        setFlipped(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (i - 1 + total) % total);
        setFlipped(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, deck]);

  return (
    <section
      className={`study ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        chooseFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="study-intro">
        <h2>Study mode</h2>
        <p>Upload a PDF or PowerPoint and turn it into flashcards you can flip through.</p>
      </div>

      <div className="study-toolbar">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          hidden
          onChange={onFileChange}
        />
        <button type="button" className="btn-hero-attach" onClick={() => fileRef.current?.click()} disabled={loading}>
          {file ? "Change file" : "Choose PDF or PowerPoint"}
        </button>
        {file && (
          <span className="upload-pill active" title={file.name}>
            <span className="pdf-badge">{/\.pptx$/i.test(file.name) ? "PPT" : "PDF"}</span>
            <span className="doc-name">{file.name}</span>
          </span>
        )}
        <label className="count-picker">
          Cards
          <select value={count} disabled={loading} onChange={(e) => setCount(Number(e.target.value))}>
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-send study-generate" disabled={!file || loading} onClick={generate}>
          {loading ? "Generating…" : deck ? "Regenerate" : "Generate flashcards"}
        </button>
      </div>

      {loading && (
        <div className="loading-state study-status">
          <span className="pulse-dot"></span>
          <span>Reading the file and writing flashcards…</span>
        </div>
      )}

      {status === "error" && error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!file && !loading && (
        <button type="button" className="study-drop" onClick={() => fileRef.current?.click()}>
          <span className="hero-icon">🗂️</span>
          <span>Drop a .pdf or .pptx here</span>
        </button>
      )}

      {card && status === "ready" && (
        <div className="deck">
          <p className="deck-meta">
            {deck.filename}
            {deck.units ? ` · ${deck.units} ${deck.unit_label === "Slide" ? "slides" : "pages"}` : ""}
            {` · ${deck.cards.length} cards`}
          </p>
          <button
            type="button"
            className={`flashcard ${flipped ? "is-flipped" : ""}`}
            onClick={() => setFlipped((open) => !open)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                go(1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                go(-1);
              }
            }}
            aria-label={flipped ? "Show question" : "Show answer"}
          >
            <span className="flashcard-inner">
              <span className="flashcard-face front">
                <span className="face-kicker">Question</span>
                <span className="face-body">{card.front}</span>
                <span className="face-hint">Click or press space to flip</span>
              </span>
              <span className="flashcard-face back">
                <span className="face-kicker">Answer</span>
                <span className="face-body">{card.back}</span>
                {card.source && <span className="source-tag">{card.source}</span>}
              </span>
            </span>
          </button>
          <div className="deck-nav">
            <button type="button" className="pill-action-btn" onClick={() => go(-1)} disabled={deck.cards.length < 2}>
              Previous
            </button>
            <span className="deck-count">
              {index + 1} / {deck.cards.length}
            </span>
            <button type="button" className="pill-action-btn" onClick={() => go(1)} disabled={deck.cards.length < 2}>
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
