import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./neon.css";
import "./lobby.css";
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="error-screen">
        <h1>The stage needs a reset.</h1>
        <p>Your game is saved on the server. Refresh to reconnect.</p>
        <button className="btn" onClick={() => location.reload()}>
          Reconnect to the game
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

import "./play.css";

import "./broadcast.css";
