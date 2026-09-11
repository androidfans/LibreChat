const { EventEmitter } = require('events');
const winston = require('winston');
// The shared API test setup mocks Winston; include its event/lifecycle methods here.
winston.createLogger.mockReturnValue({ info: jest.fn(), on: jest.fn(), close: jest.fn() });
const {
  getTraceLogger,
  structural,
  traceMessages,
  requestTrace,
  monitorMongo,
  monitorTopology,
  classifyError,
} = require('./messageTrace');

describe('message tracing', () => {
  let info;
  const records = () =>
    info.mock.calls.map(([line]) => JSON.parse(line.split('[message-trace] ')[1]));
  beforeEach(() => {
    process.env.MESSAGE_TRACE_ENABLED = 'true';
    info = jest.spyOn(getTraceLogger(), 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.MESSAGE_TRACE_ENABLED;
    info.mockRestore();
  });
  afterAll(() => getTraceLogger().close());

  it('classifies context limits, size limits and aborts without exposing raw provider errors', () => {
    expect(
      classifyError({
        status: 400,
        message: 'private prompt and credentials',
        error: { code: 'context_length_exceeded' },
      }),
    ).toEqual({ category: 'context_limit', contextOverflow: true, aborted: false, status: 400 });
    expect(
      classifyError(new Error('{ "type": "INPUT_LENGTH", "info": "300 / 100" }')),
    ).toMatchObject({ category: 'context_limit' });
    expect(classifyError({ cause: new Error('maximum context length exceeded') })).toMatchObject({
      category: 'context_limit',
    });
    expect(classifyError({ status: 413, message: 'private' })).toMatchObject({
      category: 'request_size',
      contextOverflow: false,
    });
    expect(classifyError({ name: 'AbortError' })).toMatchObject({ category: 'aborted' });
    expect(classifyError({ status: 429 })).toMatchObject({ category: 'rate_limit' });
    expect(classifyError({ status: 429, message: 'Token rate limit exceeded' })).toMatchObject({
      category: 'rate_limit',
      contextOverflow: false,
    });
    expect(classifyError(null)).toMatchObject({ category: 'other', contextOverflow: false });
  });

  it('allows only graph metadata in nested database writes', () => {
    expect(
      structural({
        $set: {
          messageId: 'reply',
          parentMessageId: 'question',
          text: 'private text',
          content: [{ text: 'private content' }],
          token: 'secret',
          metadata: { access_token: 'secret' },
        },
        $unset: { parentMessageId: 1, password: 1 },
        $or: [{ conversationId: 'conversation' }, { user: 'user', password: 'secret' }],
      }),
    ).toEqual({
      $set: { messageId: 'reply', parentMessageId: 'question' },
      $unset: { parentMessageId: 1 },
      $or: [{ conversationId: 'conversation' }, { user: 'user' }],
    });
  });

  it('records every target in chunked snapshots without logging message bodies', () => {
    const messages = Array.from({ length: 601 }, (_, index) => ({
      messageId: `m-${index}`,
      parentMessageId: `m-${index - 1}`,
      text: 'private',
    }));
    traceMessages('db.delete.targets', messages);
    const result = records();
    expect(result).toHaveLength(3);
    expect(result.flatMap((entry) => entry.messages)).toHaveLength(601);
    expect(new Set(result.map((entry) => entry.snapshotId)).size).toBe(1);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('correlates writes with requests and distinguishes success from failure', () => {
    const client = new EventEmitter();
    monitorMongo(client);
    const req = {
      originalUrl: '/api/messages/conversation/reply/subtree?secret=hidden',
      method: 'DELETE',
      user: { id: 'user' },
      get: () => 'tab-1',
      body: { conversationId: 'conversation', text: 'private' },
    };
    const res = new EventEmitter();
    res.setHeader = jest.fn();
    res.statusCode = 200;
    res.writableFinished = true;
    requestTrace(req, res, () => {
      client.emit('commandStarted', {
        databaseName: 'LibreChat',
        commandName: 'delete',
        requestId: 1,
        command: { delete: 'messages', deletes: [{ q: { messageId: 'reply' }, limit: 0 }] },
      });
    });
    client.emit('commandSucceeded', { requestId: 1, duration: 2, reply: { n: 1 } });
    res.emit('close');
    const result = records();
    expect(result.map((entry) => entry.event)).toEqual([
      'http.start',
      'db.write.start',
      'db.write.end',
      'http.end',
    ]);
    expect(new Set(result.map((entry) => entry.requestId)).size).toBe(1);
    expect(result.every((entry) => entry.tabId === 'tab-1')).toBe(true);
    expect(result[2].matchedCount).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/private|hidden/);

    client.emit('commandStarted', {
      databaseName: 'LibreChat',
      commandName: 'update',
      requestId: 2,
      command: {
        update: 'messages',
        updates: [
          { q: { messageId: 'reply' }, u: { $set: { parentMessageId: 'other', text: 'private' } } },
        ],
      },
    });
    client.emit('commandFailed', { requestId: 2, failure: { code: 11000, message: 'private' } });
    expect(records().at(-1)).toMatchObject({ event: 'db.write.failed', errorCode: 11000 });
    expect(JSON.stringify(records())).not.toContain('private');
  });

  it('does not attach database monitoring while disabled', () => {
    delete process.env.MESSAGE_TRACE_ENABLED;
    const client = new EventEmitter();
    monitorMongo(client);
    traceMessages('db.messages.read', [{ messageId: 'message' }]);
    expect(client.eventNames()).toEqual([]);
    expect(info).not.toHaveBeenCalled();
  });

  it('traces collection routes with query parameters while excluding the query from logs', () => {
    const req = {
      originalUrl: '/api/convos?arg=private-query',
      method: 'DELETE',
      get: () => undefined,
      body: {},
    };
    const res = new EventEmitter();
    res.setHeader = jest.fn();
    res.statusCode = 204;
    res.writableFinished = true;
    const next = jest.fn();
    requestTrace(req, res, next);
    res.emit('close');
    expect(next).toHaveBeenCalledTimes(1);
    expect(records().map((entry) => entry.event)).toEqual(['http.start', 'http.end']);
    expect(records()[0]).toMatchObject({ path: '/api/convos', method: 'DELETE' });
    expect(JSON.stringify(records())).not.toContain('private-query');
  });

  it('detects external removals and parent changes using read-only snapshots', async () => {
    jest.useFakeTimers();
    const toArray = jest
      .fn()
      .mockResolvedValueOnce([
        { _id: 'row-1', messageId: 'reply', parentMessageId: 'root' },
        { _id: 'row-2', messageId: 'removed', parentMessageId: 'reply' },
      ])
      .mockResolvedValueOnce([
        { _id: 'row-1', messageId: 'reply', parentMessageId: 'different-root' },
      ]);
    const db = { collection: jest.fn(() => ({ find: jest.fn(() => ({ toArray })) })) };
    try {
      monitorTopology(db);
      await jest.advanceTimersByTimeAsync(60000);
      expect(records().map((entry) => entry.event)).toEqual([
        'db.topology.baseline',
        'db.topology.removed',
        'db.topology.changed',
      ]);
      expect(records()[1].messages[0].messageId).toBe('removed');
      expect(records()[2].messages[0].parentMessageId).toBe('different-root');
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
