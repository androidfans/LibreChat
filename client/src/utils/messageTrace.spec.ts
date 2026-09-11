import type { TMessage } from 'librechat-data-provider';

describe('message trace transport', () => {
  let originalFetch: typeof fetch;
  let mockFetch: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.VITE_MESSAGE_TRACE_ENABLED = 'true';
    originalFetch = global.fetch;
    mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: mockFetch,
    });
    sessionStorage.clear();
  });
  afterEach(() => {
    delete process.env.VITE_MESSAGE_TRACE_ENABLED;
    global.fetch = originalFetch;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('sends only graph metadata and keeps credentials outside persisted records', async () => {
    jest.isolateModules(() => {
      const { traceMessageGraph, setMessageTraceToken } =
        jest.requireActual<typeof import('./messageTrace')>('./messageTrace');
      setMessageTraceToken('private-token');
      traceMessageGraph(
        'cache.graph',
        [
          {
            messageId: 'reply',
            parentMessageId: 'missing',
            conversationId: 'conversation',
            text: 'private body',
            content: [{ text: 'private content' }],
          } as unknown as TMessage,
        ],
        { conversationId: 'conversation' },
      );
    });
    await jest.advanceTimersByTimeAsync(1500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3080/api/diagnostics/messages');
    expect(options.headers.Authorization).toBe('Bearer private-token');
    expect(options.body).not.toMatch(/private/);
    expect(sessionStorage.getItem('librechat.message-trace')).not.toMatch(/private/);
    expect(JSON.parse(options.body).events[0]).toMatchObject({
      graph: [['reply', 'missing', 'conversation']],
      orphanIds: ['reply'],
    });
  });

  it('bounds the buffer and does not issue unauthenticated requests', async () => {
    jest.isolateModules(() => {
      const { traceMessage } =
        jest.requireActual<typeof import('./messageTrace')>('./messageTrace');
      for (let i = 0; i < 400; i++) traceMessage('branch.switch', { siblingIndex: i });
    });
    await jest.advanceTimersByTimeAsync(1500);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem('librechat.message-trace')!).events).toHaveLength(300);
  });

  it('does not collect or upload diagnostics when the frontend switch is disabled', async () => {
    process.env.VITE_MESSAGE_TRACE_ENABLED = 'false';
    jest.isolateModules(() => {
      const { traceMessage, setMessageTraceToken, messageTraceHeaders } =
        jest.requireActual<typeof import('./messageTrace')>('./messageTrace');
      setMessageTraceToken('token');
      traceMessage('branch.switch', { conversationId: 'conversation' });
      expect(messageTraceHeaders()).toEqual({});
    });
    await jest.advanceTimersByTimeAsync(1500);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('librechat.message-trace')).toBeNull();
  });

  it('associates viewport and reset events with the current route even without a message ID', () => {
    window.history.replaceState(null, '', '/c/current-conversation');
    try {
      jest.isolateModules(() => {
        const { traceMessage } =
          jest.requireActual<typeof import('./messageTrace')>('./messageTrace');
        traceMessage('branch.reset', { parentMessageId: null, reason: 'index-out-of-bounds' });
      });
      expect(
        JSON.parse(sessionStorage.getItem('librechat.message-trace')!).events[0],
      ).toMatchObject({ routeConversationId: 'current-conversation' });
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('stops remote uploads when the server disables diagnostics', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    let trace: (event: string) => void;
    jest.isolateModules(() => {
      const { traceMessage, setMessageTraceToken } =
        jest.requireActual<typeof import('./messageTrace')>('./messageTrace');
      trace = traceMessage;
      setMessageTraceToken('token');
      trace('stream.start');
    });
    await jest.advanceTimersByTimeAsync(1500);
    trace!('stream.final');
    await jest.advanceTimersByTimeAsync(1500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not requeue a failed upload after logout', async () => {
    let fail: (error: Error) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    let trace: (event: string, details: { conversationId: string }) => void;
    let setToken: (token?: string) => void;
    jest.isolateModules(() => {
      const module = jest.requireActual<typeof import('./messageTrace')>('./messageTrace');
      trace = module.traceMessage;
      setToken = module.setMessageTraceToken;
      setToken('old-token');
      trace('cache.graph', { conversationId: 'old-conversation' });
    });
    await jest.advanceTimersByTimeAsync(1500);
    setToken!(undefined);
    setToken!('new-token');
    trace!('cache.graph', { conversationId: 'new-conversation' });
    fail!(new Error('Network disconnected'));
    await jest.advanceTimersByTimeAsync(1500);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].body).not.toContain('old-conversation');
    expect(mockFetch.mock.calls[1][1].body).toContain('new-conversation');
  });
});
