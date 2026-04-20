// src/components/NutriBot.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const WELCOME = "Hi! I'm NutriBot 🤖 Your personal AI nutrition assistant. Tell me about your health history, ask about foods, or share any dietary concerns — I'll give advice tailored to you!";

export default function NutriBot({ onNeedLogin }) {
  const { user, token } = useAuth();
  const [open, setOpen]     = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME }
  ]);
  const [input, setInput]   = useState('');
  const [typing, setTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Load chat history on open (once per session)
  useEffect(() => {
    if (open && user && token && !loaded) {
      setLoaded(true);
      fetch('/api/chat/history', { headers: { 'X-Auth-Token': token } })
        .then(r => r.ok ? r.json() : [])
        .then(hist => {
          if (hist && hist.length > 0) {
            const mapped = hist.map(h => ({ role: h.role, content: h.content }));
            setMessages([{ role: 'assistant', content: WELCOME }, ...mapped]);
          }
        })
        .catch(() => {});
    }
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, user, token, loaded]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleToggle = useCallback(() => {
    if (!open && !user) {
      onNeedLogin?.();
      return;
    }
    setOpen(o => !o);
  }, [open, user, onNeedLogin]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || typing) return;
    if (!user || !token) { onNeedLogin?.(); return; }

    setMessages(m => [...m, { role: 'user', content: text }]);
    setInput('');
    setTyping(true);

    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.reply || 'Sorry, something went wrong.' }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setTyping(false);
    }
  }, [input, typing, user, token, onNeedLogin]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const SUGGESTIONS = [
    "I used to have high BP — what foods should I avoid?",
    "Is idli good for diabetes?",
    "I recovered from COVID — what should I eat?",
    "What are the best heart-healthy Indian foods?",
  ];

  return (
    <>
      {/* ── CHAT WINDOW ── */}
      <div className={`nutribot-window${open ? ' nutribot-window--open' : ''}`}>
        {/* Header */}
        <div className="nutribot-header">
          <div className="nutribot-header-left">
            <div className="nutribot-avatar-sm">🤖</div>
            <div>
              <div className="nutribot-name">NutriBot</div>
              <div className="nutribot-status">
                <span className="nutribot-dot" />
                AI Nutrition Assistant
              </div>
            </div>
          </div>
          <button className="nutribot-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Messages */}
        <div className="nutribot-messages" id="nutribot-scroll">
          {messages.map((m, i) => (
            <div key={i} className={`nb-msg nb-msg--${m.role}`}>
              {m.role === 'assistant' && <div className="nb-avatar">🤖</div>}
              <div className="nb-bubble">{m.content}</div>
            </div>
          ))}

          {typing && (
            <div className="nb-msg nb-msg--assistant">
              <div className="nb-avatar">🤖</div>
              <div className="nb-bubble nb-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions (only when few messages) */}
        {messages.length <= 2 && (
          <div className="nutribot-suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="nb-suggestion" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="nutribot-input-row">
          <textarea
            ref={inputRef}
            className="nutribot-input"
            placeholder="Ask me about food, health, or your diet…"
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            className={`nutribot-send${input.trim() && !typing ? ' nutribot-send--active' : ''}`}
            onClick={sendMessage}
            disabled={!input.trim() || typing}
            title="Send"
          >
            ➤
          </button>
        </div>
      </div>

      {/* ── FAB BUTTON ── */}
      <button
        className={`nutribot-fab${open ? ' nutribot-fab--open' : ''}`}
        onClick={handleToggle}
        title={user ? 'Chat with NutriBot' : 'Sign in to chat with NutriBot'}
        aria-label="NutriBot chat"
      >
        <span className="nutribot-fab-icon">{open ? '✕' : '🤖'}</span>
        {!open && <span className="nutribot-fab-label">NutriBot</span>}
        {!open && !user && <span className="nutribot-fab-badge">🔒</span>}
      </button>
    </>
  );
}