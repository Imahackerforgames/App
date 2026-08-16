import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

/* ──────────────────────────────────────────────────────────────
   window.storage shim.

   The app was prototyped in an environment that provided a
   window.storage API. That doesn't exist in a normal browser, so
   without this the app crashes on first load.

   Backed by localStorage here. As you migrate each feature to
   Supabase, delete the corresponding calls — this is scaffolding,
   not a destination.
   ────────────────────────────────────────────────────────────── */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(key);
      return v === null ? null : { key, value: v };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true };
    },
    async list(prefix = "") {
      return { keys: Object.keys(localStorage).filter((k) => k.startsWith(prefix)) };
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
