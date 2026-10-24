import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="midnight-canvas flex flex-col items-center justify-center min-h-screen p-6 text-center">
          <div className="max-w-md w-full p-8 rounded-3xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl text-slate-100 flex flex-col items-center">
            <div className="size-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              ⚠️
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              {this.state.error?.message || "An unexpected application error occurred."}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all duration-200"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
