import { v4 } from 'uuid';
import type { TMessage } from 'librechat-data-provider';

export const messageTraceEnabled = import.meta.env.VITE_MESSAGE_TRACE_ENABLED === 'true';
const STORAGE_KEY = 'librechat.message-trace';
const MAX_EVENTS = 300;
export const messageTraceTabId = messageTraceEnabled ? v4() : '';
export const messageTraceHeaders = (): Record<string, string> =>
  messageTraceEnabled ? { 'X-LibreChat-Tab-Id': messageTraceTabId } : {};
type Details = Record<
  string,
  string | number | boolean | null | undefined | string[] | (string | null)[][]
>;
type TraceEvent = Details & { event: string; seq: number; at: string };
let sequence = 0;
let token: string | undefined;
let generation = 0;
let queue: TraceEvent[] = [];
let eventHistory: TraceEvent[] = [];
let sending = false;
let transportDisabled = false;
let timer: ReturnType<typeof setTimeout> | undefined;

if (messageTraceEnabled) {
  try {
    const previous = sessionStorage.getItem(STORAGE_KEY);
    if (previous) {
      sessionStorage.setItem(`${STORAGE_KEY}.previous`, previous);
    }
  } catch {
    /* storage may be unavailable */
  }
}

const endpoint = () => new URL('api/diagnostics/messages', document.baseURI).toString();

function persist() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabId: messageTraceTabId, events: eventHistory }),
    );
  } catch {
    // Quota/private-browsing errors must not affect chat.
  }
}

async function flush() {
  timer = undefined;
  if (!token || sending || transportDisabled || queue.length === 0) {
    return;
  }
  const batch = queue.splice(0, 5);
  const batchGeneration = generation;
  while (batch.length > 1 && new Blob([JSON.stringify(batch)]).size > 96000) {
    queue.unshift(batch.pop()!);
  }
  sending = true;
  try {
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tabId: messageTraceTabId, events: batch }),
    });
    if (batchGeneration !== generation) {
      return;
    }
    if (!response.ok) {
      queue = [...batch, ...queue].slice(-MAX_EVENTS);
      if (response.status === 404) {
        transportDisabled = true;
      }
      // No auth refresh or aggressive retry from diagnostics. Resume on the next event/token.
      return;
    }
  } catch {
    if (batchGeneration === generation) {
      queue = [...batch, ...queue].slice(-MAX_EVENTS);
    }
    return;
  } finally {
    sending = false;
    if (batchGeneration !== generation && queue.length && token) {
      schedule();
    }
  }
  if (queue.length) {
    schedule();
  }
}

function schedule() {
  if (!timer) {
    timer = setTimeout(() => void flush(), 1500);
  }
}

export function setMessageTraceToken(value?: string) {
  if (!messageTraceEnabled) {
    return;
  }
  token = value;
  if (value) {
    schedule();
  } else {
    generation++;
    queue = [];
    eventHistory = [];
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }
}

export function traceMessage(event: string, details: Details = {}) {
  if (!messageTraceEnabled) {
    return;
  }
  const entry = {
    routeConversationId: window.location.pathname.match(/\/c\/([^/]+)/)?.[1],
    ...details,
    event,
    seq: ++sequence,
    at: new Date().toISOString(),
  };
  eventHistory = [...eventHistory, entry].slice(-MAX_EVENTS);
  queue = [...queue, entry].slice(-MAX_EVENTS);
  persist();
  schedule();
}

export function messageGraph(messages?: TMessage[] | null): (string | null)[][] {
  return (messages ?? []).map((message) => [
    message.messageId,
    message.parentMessageId ?? null,
    message.conversationId ?? null,
  ]);
}

export function traceMessageGraph(event: string, messages: TMessage[], details: Details = {}) {
  if (!messageTraceEnabled) {
    return;
  }
  const graph = messageGraph(messages);
  const ids = new Set(messages.map((message) => message.messageId));
  const orphanIds = messages
    .filter(
      (message) =>
        message.parentMessageId &&
        message.parentMessageId !== '00000000-0000-0000-0000-000000000000' &&
        !ids.has(message.parentMessageId),
    )
    .map((message) => message.messageId);
  for (let offset = 0; offset < Math.max(graph.length, 1); offset += 100) {
    traceMessage(event, {
      ...details,
      count: graph.length,
      offset,
      graph: graph.slice(offset, offset + 100),
      orphanIds: orphanIds.slice(0, 300),
    });
  }
}

export function traceMessageViewport(parentMessageId?: string | null, source = 'branch-switch') {
  if (!messageTraceEnabled) {
    return;
  }
  const container = document.getElementById('messages-end')?.closest('.scrollbar-gutter-stable');
  if (!container) {
    traceMessage('view.snapshot', { parentMessageId, source, reason: 'container-missing' });
    return;
  }
  const bounds = container.getBoundingClientRect();
  const elements = Array.from(container.querySelectorAll<HTMLElement>('.message-render'));
  traceMessage('view.snapshot', {
    parentMessageId,
    source,
    count: elements.length,
    messageIds: elements.map((element) => element.id).slice(0, 300),
    visibleIds: elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
      })
      .map((element) => element.id)
      .slice(0, 300),
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  });
}
