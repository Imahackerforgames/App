import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X } from "lucide-react";

/* ──────────────────────────────────────────────────────────────
   AIAssistant

   The bundle's assistant, adapted to this project in two ways:

   1. JSX, not TSX. This project has no TypeScript toolchain — no
      `typescript` dependency, no tsconfig.json, and `npm run build`
      is a bare `vite build` with no typecheck step. Adding TS for one
      component would mean a mixed codebase and a config the rest of
      the app doesn't use.

   2. Themed, not Tailwind. This project has no Tailwind; it styles
      with inline objects driven by CSS variables, and the bundle's
      white card would have rendered unstyled and clashed with the
      dark theme. Behaviour, state, and the request/response contract
      are unchanged from the bundle.

   Talks to the `ai-assistant` Supabase Edge Function. The Anthropic
   key lives there and never reaches the browser.
   ────────────────────────────────────────────────────────────── */

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://ggfqqybjcljtqezyuxyx.supabase.co";
const PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_QMiKmcOp-0WkYaYu9k0fpw_uXMqE9BC";
const FN_URL = `${SUPABASE_URL}/functions/v1/ai-assistant`;

// Theme tokens, same CSS variables the rest of the app uses. Set by
// <Styles/> on the root, so every palette works without changes here.
const C = {
  panel: "var(--c-panel)",
  raised: "var(--c-raised)",
  line: "var(--c-line)",
  accent: "var(--c-accent)",
  bone: "var(--c-bone)",
  dim: "var(--c-dim)",
  dead: "var(--c-dead)",
};
const SANS = "'Archivo', ui-sans-serif, system-ui, sans-serif";

const WELCOME_ID = "welcome";

const INITIAL_MESSAGE = {
  id: WELCOME_ID,
  role: "assistant",
  content:
    "Ask me anything — reselling, research, tech, business, writing, or everyday questions. I can search the web when the answer depends on current information.",
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function AIAssistant({
  context = "",
  starters = [],
  token = null,
  onClose,
}) {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function resetChat() {
    setMessages([INITIAL_MESSAGE]);
    setInput("");
    setError("");
    textareaRef.current?.focus();
  }

  async function submitMessage(text) {
    const cleaned = (text ?? "").trim();
    if (!cleaned || loading) return;

    setError("");
    const userMessage = { id: createId(), role: "user", content: cleaned };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      // The local welcome message is ours, not Claude's — don't send it.
      const conversation = nextMessages
        .filter((m) => m.id !== WELCOME_ID)
        .map((m) => ({ role: m.role, content: m.content }));

      const headers = {
        "Content-Type": "application/json",
        apikey: PUBLISHABLE_KEY,
      };
      // The function runs with verify_jwt on, so anonymous traffic can't
      // spend credits. Send the signed-in user's token.
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(FN_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: conversation, context }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "The assistant couldn't generate a response.");
      }

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: data.answer || "I wasn't able to generate an answer.",
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ]);
    } catch (err) {
      console.error("AI Assistant error:", err);
      // A blocked or unreachable request surfaces as a bare "Failed to fetch"
      // (Chrome) or "Load failed" (Safari), which tells the user nothing.
      // Name the actual cause instead.
      const raw = err instanceof Error ? err.message : "";
      const isNetwork = /failed to fetch|load failed|networkerror|network request failed/i.test(raw);
      setError(
        isNetwork
          ? "Can't reach the assistant service. The ai-assistant function may not be deployed yet, or you're offline."
          : raw || "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage(input);
    }
  }

  const canSend = !loading && input.trim().length > 0;
  const showStarters = messages.length === 1 && starters.length > 0;

  return (
    <>
      {/* header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 18px 12px",
          gap: 8,
        }}
      >
        <span
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800 }}
        >
          <Sparkles size={16} color={C.accent} /> Assistant
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={resetChat}
            type="button"
            className="fx fx-chip"
            style={{
              background: "transparent",
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              padding: "6px 13px",
              cursor: "pointer",
              fontFamily: SANS,
              fontSize: 11.5,
              fontWeight: 600,
              color: C.dim,
            }}
          >
            New chat
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="fx"
              style={{
                background: C.raised,
                border: "none",
                borderRadius: 999,
                width: 30,
                height: 30,
                cursor: "pointer",
                color: C.dim,
                display: "grid",
                placeItems: "center",
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* conversation */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
        {showStarters && (
          <div className="rise" style={{ display: "grid", gap: 8, marginTop: 6, marginBottom: 12 }}>
            {starters.map(([emoji, text]) => (
              <button
                key={text}
                type="button"
                onClick={() => submitMessage(text)}
                className="fx fx-chip"
                style={{
                  background: C.panel,
                  border: `1px solid ${C.line}`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  color: C.bone,
                  fontFamily: SANS,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span>{emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{text}</span>
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className="rise"
            style={{
              display: "flex",
              justifyContent: message.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div style={{ maxWidth: "86%" }}>
              <div
                style={{
                  padding: "11px 15px",
                  borderRadius: 18,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: message.role === "user" ? C.accent : C.raised,
                  color: message.role === "user" ? "#fff" : C.bone,
                }}
              >
                {message.content}
              </div>

              {message.sources?.length > 0 && (
                <div style={{ marginTop: 7, paddingLeft: 4 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: C.dead,
                      marginBottom: 5,
                    }}
                  >
                    Sources · searched the web
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {message.sources.slice(0, 4).map((source, index) => (
                      <a
                        key={`${source.url}-${index}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="lnk"
                        style={{
                          fontSize: 10.5,
                          padding: "4px 9px",
                          borderRadius: 999,
                          color: C.dim,
                          border: `1px solid ${C.line}`,
                          textDecoration: "none",
                          maxWidth: 150,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {source.title || source.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", gap: 6, padding: "8px 2px" }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: C.accent,
                  animation: "pulse 1.1s infinite",
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              borderRadius: 14,
              border: `1px solid ${C.accent}`,
              background: "color-mix(in srgb, var(--c-accent) 12%, transparent)",
              padding: "10px 14px",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: C.bone,
              margin: "4px 0 10px",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={12000}
            disabled={loading}
            placeholder="Ask me anything…"
            className="auth-in"
            style={{
              flex: 1,
              resize: "none",
              minHeight: 46,
              maxHeight: 140,
              padding: "13px 16px",
              fontFamily: SANS,
              fontSize: 14,
              lineHeight: 1.45,
              color: C.bone,
              background: C.raised,
              border: `1px solid ${C.line}`,
              borderRadius: 22,
              outline: "none",
              opacity: loading ? 0.6 : 1,
            }}
          />
          <button
            type="button"
            onClick={() => submitMessage(input)}
            disabled={!canSend}
            aria-label="Send"
            className={canSend ? "fx fx-accent" : ""}
            style={{
              background: canSend ? C.accent : C.raised,
              border: "none",
              borderRadius: 999,
              width: 46,
              height: 46,
              cursor: canSend ? "pointer" : "not-allowed",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Send size={16} color={canSend ? "#fff" : C.dead} />
          </button>
        </div>
        <p
          style={{
            margin: "9px 0 0",
            textAlign: "center",
            fontSize: 10.5,
            color: C.dead,
          }}
        >
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </>
  );
}
