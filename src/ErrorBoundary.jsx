import React from "react";

/* ──────────────────────────────────────────────────────────────
   The last line of defence.

   React unmounts the whole tree when a render throws. Without a boundary
   above it that leaves an empty <div id="root"> — a blank white page, no
   message, no way back. The person concludes the site is broken and leaves,
   and nobody ever finds out it happened.

   Everything here is deliberately self-contained: inline styles, no theme,
   no app imports, no hooks. It has to render when the app could not, so it
   must not depend on anything the app sets up.
   ────────────────────────────────────────────────────────────── */

/* The app's default dark palette, hard-coded. Reading the real theme would
   mean depending on the thing that just failed, and a white flash on a dark
   app looks like a browser error page. */
const VOID = "#0D0F10";
const PANEL = "#15181A";
const LINE = "#2B3033";
const BONE = "#F5F1E8";
const DIM = "#9DA29C";
const ACCENT = "#D4AF63";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const btn = (primary) => ({
  width: "100%",
  padding: "14px 18px",
  borderRadius: 999,
  border: primary ? "none" : `1px solid ${LINE}`,
  background: primary ? ACCENT : "transparent",
  color: primary ? VOID : DIM,
  fontSize: 14,
  fontWeight: primary ? 800 : 600,
  fontFamily: SANS,
  cursor: "pointer",
  marginTop: 10,
});

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    /* Nowhere to send this yet — the app has no error reporting. At least
       put it in the console so it exists somewhere other than a screenshot
       from a confused customer. */
    console.error("Reamp crashed:", error, info?.componentStack);
  }

  /* Breaks a crash loop. If the stored data for this account is what is
     throwing, reloading lands straight back in it; dropping the session at
     least returns a usable login screen. Deliberately removes only the
     session key — the person's inventory and sales stay where they are, in
     the database and in the cache. */
  signOutAndReload = () => {
    try { localStorage.removeItem("ros:session"); } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message = String(this.state.error?.message || this.state.error || "Unknown error");

    return (
      <div style={{
        minHeight: "100vh", background: VOID, color: BONE, fontFamily: SANS,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ fontSize: 30, marginBottom: 14 }}>⚠️</div>

          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.25 }}>
            Something went wrong
          </h1>

          <p style={{ fontSize: 14, lineHeight: 1.6, color: DIM, margin: "10px 0 0" }}>
            This is a fault in Reamp, not something you did.{" "}
            <strong style={{ color: BONE, fontWeight: 700 }}>Your data is safe</strong> — it's stored on
            our servers, not in this page.
          </p>

          <button onClick={() => window.location.reload()} style={btn(true)}>
            Reload the page
          </button>
          <button onClick={this.signOutAndReload} style={btn(false)}>
            Still broken? Sign out and reload
          </button>

          {/* The actual error, shown rather than hidden. Someone reporting
              "it broke" cannot be helped; someone who can read out this line
              can be. */}
          <div style={{
            marginTop: 22, padding: "12px 14px", borderRadius: 12,
            background: PANEL, border: `1px solid ${LINE}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: DIM, marginBottom: 7 }}>
              If you report this, include it
            </div>
            <code style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5, color: ACCENT,
              wordBreak: "break-word", display: "block" }}>
              {message.slice(0, 300)}
            </code>
          </div>
        </div>
      </div>
    );
  }
}
