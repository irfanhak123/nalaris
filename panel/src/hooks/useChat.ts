/**
 * hooks/useChat.ts — one fixed session, polled + streamed.
 *
 * Lifecycle:
 *   1. On mount: wait for persist rehydration. If a session_id was
 *      persisted, read its history. If not, create a new session.
 *      CRITICAL: the boot must wait for hydration, otherwise every
 *      reload spawns a new session and overwrites the persisted one.
 *   2. If the session has an active_stream_id, open the SSE stream
 *      and pipe events into the store. (Handles "I refreshed
 *      mid-turn" and "another tab is also sending".)
 *   3. Start a 30s polling tick on the session, so cron-tick
 *      assistant messages appear in the thread even when the user
 *      isn't actively sending.
 *   4. sendMessage(text) — append optimistic user bubble →
 *      startChat → SSE. On 409, attach to the existing stream.
 *   5. cancel() — close the local stream. Best-effort server cancel.
 *
 * This is the v1 "monolithic thread" model: one session, never
 * rotated, the long-lived memory of the day.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  gateway,
  parseSse,
  GatewayError,
  type GatewaySession,
} from '../lib/gateway';
import { reconcileMessages, useSessionStore } from '../stores/sessionStore';
import { useUserStore } from '../stores/userStore';
import { feedStream, newStreamParser, finalizeStream } from '../lib/stream-blocks';

const WORKSPACE = (import.meta.env.VITE_WORKSPACE as string | undefined) ?? 'workspace';
const PROFILE = localStorage.getItem('nalaris-profile') || (import.meta.env.VITE_PROFILE as string | undefined) || 'default';
const POLL_INTERVAL_MS = 30_000;

const SESSION_STORAGE_KEY = 'nalaris-session-id';

function resolveSessionId(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('session');
  if (fromUrl) return fromUrl;

  const fromStorage = localStorage.getItem(SESSION_STORAGE_KEY);
  if (fromStorage) return fromStorage;

  const generated = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  localStorage.setItem(SESSION_STORAGE_KEY, generated);
  return generated;
}

function makeId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useChat() {
  const session = useSessionStore((s) => s.session);
  const messages = useSessionStore((s) => s.messages);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const error = useSessionStore((s) => s.error);
  const bootDone = useSessionStore((s) => s.bootDone);
  const hydrated = useSessionStore((s) => s.hydrated);
  const meLoaded = useUserStore((s) => s.loaded);

  const setActive = useSessionStore((s) => s.setActive);
  const setMessages = useSessionStore((s) => s.setMessages);
  const setStreaming = useSessionStore((s) => s.setStreaming);
  const setStreamId = useSessionStore((s) => s.setStreamId);
  const appendLocalMessage = useSessionStore((s) => s.appendLocalMessage);
  const updateMessage = useSessionStore((s) => s.updateMessage);
  const appendToken = useSessionStore((s) => s.appendToken);
  const appendReasoning = useSessionStore((s) => s.appendReasoning);
  const appendToolCall = useSessionStore((s) => s.appendToolCall);
  const completeToolCall = useSessionStore((s) => s.completeToolCall);
  const setUiBlocks = useSessionStore((s) => s.setUiBlocks);
  const setStreamPhase = useSessionStore((s) => s.setStreamPhase);
  const setError = useSessionStore((s) => s.setError);
  const setDraft = useSessionStore((s) => s.setDraft);
  const setBootDone = useSessionStore((s) => s.setBootDone);

  const abortRef = useRef<AbortController | null>(null);
  // Guard against concurrent/double attachment to the same stream.
  const consumingStreamRef = useRef<string | null>(null);

  // ---- 1. Boot: load or create the session ----
  //
  // Wait for persist rehydration BEFORE creating a session. Otherwise
  // a fresh `newSession` call writes a new session_id into localStorage,
  // overwriting the persisted one — every reload loses continuity.

  useEffect(() => {
    if (!hydrated) return;
    if (bootDone) return;
    if (!meLoaded) return; // wait for the single user to load first

    let cancelled = false;
    (async () => {
      try {
        const me = useUserStore.getState().me;

        // If the user has existing sessions, load the most recent one.
        // Only create a new session if the user has none.
        let sid = '';
        let isNewSession = false;
        let foundUserSession = false;

        if (me?.user_id) {
          try {
            const { sessions: userSessions } = await gateway.getUserSessions(me.user_id);
            if (!cancelled && userSessions.length > 0) {
              sid = userSessions[0].session_id;
              localStorage.setItem(SESSION_STORAGE_KEY, sid);
              foundUserSession = true;
            }
          } catch {
            // non-fatal — fall through to resolveSessionId
          }
        }

        if (!foundUserSession) {
          sid = resolveSessionId();
        }

        // Read the session. If it doesn't exist, create it once.
        let full: { session: GatewaySession };
        try {
          full = await gateway.readSession(sid);
        } catch {
          const { session: created } = await gateway.newSession({
            workspace: WORKSPACE,
            profile: PROFILE,
            title: 'nalaris',
            user_id: me?.user_id,
          });
          isNewSession = true;
          if (cancelled) return;
          // Use the gateway's returned session ID (it may differ from our generated one)
          const realSid = created.session_id;
          if (realSid && realSid !== sid) {
            localStorage.setItem(SESSION_STORAGE_KEY, realSid);
          }
          full = await gateway.readSession(realSid).catch(() => ({
            session: { ...created, session_id: realSid, messages: [] },
          }));
        }
        if (cancelled) return;
        const localMsgs = useSessionStore.getState().messages;
        setActive({ ...full.session, messages: full.session.messages ?? [] });
        setMessages(reconcileMessages(localMsgs, full.session.messages ?? []));
        setBootDone(true);

        // Persist session_id to the gateway so the Hermes cron agent can
        // post its output to this session (cron -> panel bridge). Use the
        // resolved session id, not the local `sid` variable: the gateway
        // may have returned a different id on session creation.
        try {
          await fetch('/panel-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: full.session.session_id }),
          });
        } catch { /* non-fatal -- cron bridge is best-effort */ }

        // If this is a brand new session with no messages, auto-trigger an
        // alignment conversation. Onboarding is NOT a static form — it is
        // an agent-driven conversation that discovers what the user wants
        // to achieve, habits they want to build, and what's going on. The
        // user can re-trigger it any time from the header (requestAlignment).
        let welcomeStreamId: string | null = null;
        if (isNewSession && (!full.session.messages || full.session.messages.length === 0)) {
          try {
            const startResult = await gateway.startAlignment(full.session.session_id);
            welcomeStreamId = startResult.stream_id;
          } catch {
            // non-fatal -- user can still chat manually
          }
        }

        // 2. Publish any active/welcome stream id so the reactive attach
        // effect below connects to the live SSE. If there was already an
        // active stream, setActive() already copied it into the store.
        if (welcomeStreamId) {
          setStreamId(welcomeStreamId);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setBootDone(true);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, bootDone, meLoaded]);

  // ---- 2b. Auto-attach to any stream id that appears in the store ----
  // Block actions (useBlockAction) start a turn and publish the stream id;
  // this effect picks it up and consumes the response so dynamic blocks and
  // agent replies actually render.
  const activeStreamId = useSessionStore((s) => s.activeStreamId);

  useEffect(() => {
    const sid = useSessionStore.getState().session?.session_id;
    if (!activeStreamId || !sid || isStreaming) return;
    if (consumingStreamRef.current === activeStreamId) return;
    attachToStream(activeStreamId, sid).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('attach to stream failed:', e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStreamId, isStreaming]);

  // ---- 3. Poll for cron ticks ----

  useEffect(() => {
    if (!bootDone) return;
    const sid = useSessionStore.getState().session?.session_id;
    if (!sid) return;
    const id = setInterval(async () => {
      if (useSessionStore.getState().isStreaming) return;
      try {
        const full = await gateway.readSession(sid);
        setMessages(reconcileMessages(useSessionStore.getState().messages, full.session.messages ?? []));
      } catch {
        // non-fatal
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [bootDone, setMessages]);

  // ---- 3b. Recover from a stream that finished without telling us ----
  // The SSE connection can go idle or the tab can sleep. If the store
  // still thinks we're streaming but the gateway's session has no active
  // stream, reconcile so the final message appears without a manual refresh.

  useEffect(() => {
    if (!bootDone) return;
    const sid = useSessionStore.getState().session?.session_id;
    if (!sid) return;
    const id = setInterval(async () => {
      if (!useSessionStore.getState().isStreaming) return;
      // An SSE consumer is actively attached — let its own `finally` block
      // reconcile. Stomping here would freeze the in-flight bubble.
      if (consumingStreamRef.current) return;
      try {
        const full = await gateway.readSession(sid);
        // Only recover when the server EXPLICITLY says the turn is done.
        // `is_streaming` is undefined for backends that don't report it;
        // treat that as "unknown, don't touch" instead of "done".
        if (full.session.is_streaming === false) {
          setStreaming(false);
          setStreamId(null);
          setMessages(reconcileMessages(useSessionStore.getState().messages, full.session.messages ?? []));
        }
      } catch {
        // non-fatal
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [bootDone, setMessages, setStreaming, setStreamId]);

  // ---- 3c. Visibility fallback ----
  // When the user returns to the tab, immediately reconcile if we believe
  // a stream is active. Catches cases where the browser throttled SSE while
  // hidden and the `done` event never fired locally.

  useEffect(() => {
    if (!bootDone) return;
    const sid = useSessionStore.getState().session?.session_id;
    if (!sid) return;

    const onVisible = async () => {
      if (!document.hidden && useSessionStore.getState().isStreaming) {
        try {
          const full = await gateway.readSession(sid);
          // Only act when the server explicitly says the turn is done.
          // If it's still streaming, the SSE connection resumes on visible —
          // reconciling now would freeze the in-flight assistant bubble.
          if (full.session.is_streaming === false) {
            setStreaming(false);
            setStreamId(null);
            setMessages(reconcileMessages(useSessionStore.getState().messages, full.session.messages ?? []));
          }
        } catch {
          // non-fatal
        }
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [bootDone, setMessages, setStreaming, setStreamId]);

  // ---- 4. Send a message ----
  //
  // IMPORTANT: read session_id from the store at call time, not from
  // the closure. The closure value is from the render where the
  // callback was created; if boot completes between render and click,
  // the closure is stale.

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Read the freshest state at call time.
      const cur = useSessionStore.getState();
      if (cur.isStreaming) {
        // A turn is already in flight — block the double-send so we don't
        // spawn a second stream and race two assistant bubbles.
        return;
      }
      if (!cur.hydrated) {
        setError('still loading — try again in a moment');
        return;
      }
      if (!cur.bootDone) {
        setError('still booting — try again in a moment');
        return;
      }
      const sid = cur.session?.session_id;
      if (!sid) {
        setError('no session yet — try again in a moment');
        return;
      }

      setError(null);
      const clientMsgId = makeId();
      const now = Date.now() / 1000;

      appendLocalMessage({
        role: 'user',
        content: trimmed,
        timestamp: now,
        client_msg_id: clientMsgId,
      });
      setDraft('');

      // Send the user's text as-is. System-level instructions about
      // block emission live in the `personal-assistant-chat-blocks`
      // skill, not in the frontend. The skill is loaded by the
      // agent runtime so user input stays clean.
      const messageForLlm = trimmed;

      let streamId: string;
      try {
        const start = await gateway.startChat({
          session_id: sid,
          message: messageForLlm,
          workspace: WORKSPACE,
          profile: PROFILE,
          client_msg_id: clientMsgId,
        });
        streamId = start.stream_id;
      } catch (e) {
        if (e instanceof GatewayError && e.status === 409) {
          // The session already has an active stream — attach to it.
          const existing = (e.extra?.active_stream_id as string | undefined) ?? null;
          if (existing) {
            await attachToStream(existing, sid);
            return;
          }
          setError('session is busy and no active stream id was returned');
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
        return;
      }

      // Mark streaming immediately so the UI shows activity and the poller
      // knows a turn is in flight. If consumeStream later hangs, the watchdog
      // and visibility handling can recover.
      setStreaming(true);
      setStreamId(streamId);

      await consumeStream(streamId, sid);
    },
    [appendLocalMessage, setDraft, setError, setStreaming, setStreamId],
  );

  // ---- Stream consumer ----

  const consumeStream = useCallback(
    async (streamId: string, sid: string) => {
      if (consumingStreamRef.current === streamId) return;
      consumingStreamRef.current = streamId;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const parser = newStreamParser();

      // Watchdogs: if the SSE goes silent for too long, abort so the finally
      // block reconciles with the server. This prevents the UI from appearing
      // to hang when the gateway connection stalls but the turn is done.
      // Tool-heavy agent turns can be quiet for a while, so the idle timeout
      // is generous; any SSE event (token, reasoning, tool, metering) resets it.
      const WATCHDOG_MS = 120_000;
      const HARD_CAP_MS = 10 * 60_000;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const resetWatchdog = () => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          // Only abort if we are still the active stream.
          if (useSessionStore.getState().activeStreamId === streamId) {
            ctrl.abort();
          }
        }, WATCHDOG_MS);
      };
      const hardTimeout = setTimeout(() => {
        if (useSessionStore.getState().activeStreamId === streamId) {
          ctrl.abort();
        }
      }, HARD_CAP_MS);
      resetWatchdog();

      // Ensure an assistant placeholder exists so token/reasoning/tool handlers
      // can patch it. Without this, the first token finds the user message as
      // last and silently drops — the assistant bubble never appears.
      const curMsgs = useSessionStore.getState().messages;
      const lastMsg = curMsgs[curMsgs.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.streaming) {
        appendToken('');
        setStreamPhase('waiting');
      }

      try {
        const res = await fetch(`${gateway.baseUrl}/api/chat/stream?stream_id=${streamId}`, {
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`stream ${res.status}: ${await res.text()}`);
        }
        for await (const ev of parseSse(res)) {
          resetWatchdog();
          if (ev.type === 'token') {
            const chunk = ev.data.text ?? '';
            // Feed through the block parser; the parser strips fences
            // and tracks extracted blocks. We then patch the assistant
            // message with the cleaned text and the blocks.
            const result = feedStream(parser, chunk);
            // Update the in-flight assistant message with parsed state
            const cur = useSessionStore.getState();
            const last = cur.messages[cur.messages.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              const next = cur.messages.slice();
              next[next.length - 1] = {
                ...last,
                content: result.text,
                ui_blocks: result.blocks,
              };
              useSessionStore.setState({ messages: next });
            }
            setStreamPhase('writing');
          } else if (ev.type === 'reasoning') {
            appendReasoning(ev.data.text ?? '');
            setStreamPhase('thinking');
          } else if (ev.type === 'tool') {
            appendToolCall({
              name: ev.data.name ?? 'unknown',
              args: ev.data.args,
              pending: true,
              startedAt: Date.now() / 1000,
            });
            setStreamPhase('tool_use');
          } else if (ev.type === 'tool_complete') {
            completeToolCall(ev.data.name ?? '', ev.data.result);
            const state = useSessionStore.getState();
            const last = state.messages[state.messages.length - 1];
            const stillPending = last?.tool_calls?.some((tc) => tc.pending) ?? false;
            setStreamPhase(stillPending ? 'tool_use' : 'writing');
          } else if (ev.type === 'context_status' || ev.type === 'metering') {
            setStreamPhase('context');
          } else if (ev.type === 'alignment') {
            // The agent persisted alignment findings on the server. Refresh
            // the single user so the UI (and future turns) see them.
            void useUserStore.getState().refreshMe();
          } else if (ev.type === 'title') {
            const cur = useSessionStore.getState().session;
            if (cur && ev.data.title) {
              setActive({ ...cur, title: ev.data.title });
            }
          } else if (ev.type === 'done' || ev.type === 'stream_end') {
            // Finalize: strip any unclosed fence, lock in blocks
            const result = finalizeStream(parser);
            const cur = useSessionStore.getState();
            const last = cur.messages[cur.messages.length - 1];
            if (last && last.role === 'assistant') {
              const next = cur.messages.slice();
              next[next.length - 1] = {
                ...last,
                content: result.text,
                ui_blocks: result.blocks,
                streaming: false,
              };
              useSessionStore.setState({ messages: next });
            } else {
              updateMessage((m) => m.role === 'assistant' && !!m.streaming, { streaming: false });
            }
            // Alignment findings may have been persisted server-side this
            // turn even without an explicit `alignment` event.
            void useUserStore.getState().refreshMe();
            break;
          } else if (ev.type === 'error') {
            setError(String(ev.data.error ?? 'unknown error'));
            updateMessage((m) => m.role === 'assistant' && !!m.streaming, { streaming: false });
            break;
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError(e instanceof Error ? e.message : String(e));
        }
        updateMessage((m) => m.role === 'assistant' && !!m.streaming, { streaming: false });
      } finally {
        if (watchdog) clearTimeout(watchdog);
        clearTimeout(hardTimeout);
        setStreaming(false);
        setStreamId(null);
        abortRef.current = null;
        consumingStreamRef.current = null;
        // Reconcile with the server.
        try {
          const full = await gateway.readSession(sid);
          setMessages(reconcileMessages(useSessionStore.getState().messages, full.session.messages ?? []));
        } catch {
          // non-fatal
        }
      }
    },
    [appendToken, appendReasoning, appendToolCall, completeToolCall, setUiBlocks, setStreamPhase, setActive, setMessages, setStreamId, setStreaming, setError, updateMessage],
  );

  // ---- attachToStream ----
  // For when the session was already streaming when we loaded (refresh
  // mid-turn, another tab, etc). Ensures an empty assistant placeholder
  // exists so consumeStream can patch it.

  const attachToStream = useCallback(
    async (streamId: string, sid: string) => {
      if (consumingStreamRef.current === streamId) return;
      setStreamId(streamId);
      setStreaming(true);
      const allMsgs = useSessionStore.getState().messages;
      const last = allMsgs[allMsgs.length - 1];
      if (!last || last.role !== 'assistant' || !last.streaming) {
        appendToken('');
        setStreamPhase('waiting');
      }
      await consumeStream(streamId, sid);
    },
    [appendToken, setStreamId, setStreaming, setStreamPhase, consumeStream],
  );


  // ---- 5. Cancel ----

  const cancel = useCallback(async () => {
    const sid = useSessionStore.getState().activeStreamId;
    if (sid) {
      try { await gateway.cancelChat(sid); } catch { /* 404 is fine */ }
    }
    abortRef.current?.abort();
    setStreaming(false);
    setStreamId(null);
    updateMessage((m) => m.role === 'assistant' && !!m.streaming, { streaming: false });
  }, [setStreamId, setStreaming, updateMessage]);

  // ---- 6. On-demand alignment ----
  //
  // Bumped by requestAlignment() in the session store (the Header's
  // "Re-align" button). Starts an agent-driven alignment conversation in
  // the current session. The agent opens with its first question — no
  // synthetic user bubble is stored, so we seed an empty assistant
  // placeholder for the incoming tokens.

  const runAlignment = useCallback(async () => {
    const cur = useSessionStore.getState();
    if (cur.isStreaming) return;
    if (!cur.bootDone) return;
    const sid = cur.session?.session_id;
    if (!sid) return;
    setError(null);
    let streamId: string;
    try {
      const start = await gateway.startAlignment(sid);
      streamId = start.stream_id;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setStreaming(true);
    setStreamId(streamId);
    // Seed an empty assistant placeholder so token handlers can patch it.
    const allMsgs = useSessionStore.getState().messages;
    const last = allMsgs[allMsgs.length - 1];
    if (!last || last.role !== 'assistant' || !last.streaming) {
      appendToken('');
      setStreamPhase('waiting');
    }
    await consumeStream(streamId, sid);
  }, [appendToken, consumeStream, setError, setStreamId, setStreaming, setStreamPhase]);

  const alignToken = useSessionStore((s) => s.alignToken);
  useEffect(() => {
    if (alignToken === 0) return;
    runAlignment().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('alignment failed:', e);
    });
  }, [alignToken, runAlignment]);

  // bootReady: hydrated AND bootDone. Composer uses this to enable.
  const bootReady = hydrated && bootDone;

  return {
    session,
    messages,
    isStreaming,
    error,
    bootDone: bootReady,
    sendMessage,
    cancel,
    setDraft,
    runAlignment,
  };
}
