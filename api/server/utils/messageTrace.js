const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const context = new AsyncLocalStorage();
let traceLogger;
function getTraceLogger() {
  if (!traceLogger) {
    // The regular debug formatter truncates messages at 150 characters. Keep complete JSON here.
    traceLogger = winston.createLogger({
      level: 'info',
      format: winston.format.printf((info) => info.message),
      transports: [
        new winston.transports.Console(),
        new DailyRotateFile({
          filename: path.join(
            process.env.LIBRECHAT_LOG_DIR || path.resolve(__dirname, '../../../logs'),
            'message-trace-%DATE%.log',
          ),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });
    traceLogger.on('error', () => {});
  }
  return traceLogger;
}
const enabled = () => process.env.MESSAGE_TRACE_ENABLED === 'true';
const NO_PARENT = '00000000-0000-0000-0000-000000000000';
const structuralFields = new Set([
  '_id',
  'messageId',
  'newMessageId',
  'parentMessageId',
  'conversationId',
  'newConversationId',
  'overrideConvoId',
  'overrideParentMessageId',
  'responseMessageId',
  'streamId',
  'abortKey',
  'isRegenerate',
  'isContinued',
  'isEdited',
  'isTemporary',
  'arg',
  'user',
  'isCreatedByUser',
  'unfinished',
  'error',
  'expiredAt',
  'createdAt',
  'updatedAt',
  'messages',
]);
const operators = new Set([
  '$set',
  '$unset',
  '$setOnInsert',
  '$and',
  '$or',
  '$in',
  '$nin',
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$exists',
  '$pull',
  '$addToSet',
  '$each',
]);

/** Only graph metadata can pass through this serializer; never log raw Mongo commands. */
function structural(value, depth = 0) {
  if (depth > 8) {
    return '[depth limit]';
  }
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value.slice(0, 160);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value.toHexString === 'function') {
    return value.toHexString();
  }
  if (Array.isArray(value)) {
    return value.slice(0, 300).map((entry) => structural(entry, depth + 1));
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (structuralFields.has(key) || operators.has(key)) {
      result[key] =
        key === 'error' && typeof entry !== 'boolean'
          ? Boolean(entry)
          : structural(entry, depth + 1);
    }
  }
  return result;
}

function trace(event, details = {}, requestContext = context.getStore()) {
  if (!enabled()) {
    return;
  }
  try {
    const { req, ...request } = requestContext ?? {};
    // One JSON line: the default Docker console formatter drops separate metadata arguments.
    getTraceLogger().info(
      `[message-trace] ${JSON.stringify({
        ...request,
        userId: req?.user?.id,
        ...details,
        v: 1,
        event,
        at: new Date().toISOString(),
      })}`,
    );
  } catch {
    // Diagnostics must never fail a chat request.
  }
}

function traceMessages(event, messages, details = {}) {
  if (!enabled()) {
    return;
  }
  const rows = messages ?? [];
  const ids = new Set(rows.map((message) => message.messageId));
  const roots = rows.filter(
    (message) => !message.parentMessageId || message.parentMessageId === NO_PARENT,
  );
  const orphans = rows.filter(
    (message) =>
      message.parentMessageId &&
      message.parentMessageId !== NO_PARENT &&
      !ids.has(message.parentMessageId),
  );
  const snapshotId = randomUUID();
  for (let offset = 0; offset < Math.max(rows.length, 1); offset += 300) {
    trace(event, {
      ...details,
      snapshotId,
      offset,
      count: rows.length,
      rootCount: roots.length,
      missingParentCount: orphans.length,
      messages: rows.slice(offset, offset + 300).map((message) => structural(message)),
    });
  }
}

/** Classify provider failures without retaining raw errors (which may contain prompts/keys). */
function classifyError(error) {
  const candidates = [error, error?.cause, error?.error, error?.response?.data?.error];
  const description = candidates
    .flatMap((entry) =>
      typeof entry === 'string' ? [entry] : [entry?.message, entry?.code, entry?.type, entry?.name],
    )
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.slice(0, 16000))
    .join(' ');
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const contextOverflow =
    status !== 429 &&
    /context_length_exceeded|INPUT_LENGTH|maximum context|context.{0,35}(exceed|length|limit)|too many tokens|token.{0,25}(exceed|limit)|prompt.{0,25}too long/i.test(
      description,
    );
  const aborted = /AbortError|\baborted\b|\bcancelled\b/i.test(description);
  let category = 'other';
  if (contextOverflow) category = 'context_limit';
  else if (aborted) category = 'aborted';
  else if (status === 413 || /request.{0,10}too large/i.test(description))
    category = 'request_size';
  else if (status === 429) category = 'rate_limit';
  else if (/timeout|timed out/i.test(description)) category = 'timeout';
  return {
    category,
    contextOverflow,
    aborted,
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
  };
}

function requestTrace(req, res, next) {
  const requestPath = req.originalUrl.split('?')[0];
  if (
    !enabled() ||
    !/^\/api\/(messages|convos|agents|assistants|integrations)(\/|$)/.test(requestPath)
  ) {
    return next();
  }
  const requestId = randomUUID();
  req.messageTraceId = requestId;
  const tabId = req.get('X-LibreChat-Tab-Id');
  const request = {
    req,
    requestId,
    tabId: typeof tabId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(tabId) ? tabId : undefined,
    method: req.method,
    path: requestPath.slice(0, 240),
  };
  res.setHeader('X-Message-Trace-Id', requestId);
  const started = Date.now();
  context.run(request, () => {
    trace('http.start');
    res.once('close', () =>
      trace(
        'http.end',
        {
          status: res.statusCode,
          completed: res.writableFinished,
          durationMs: Date.now() - started,
          body: structural(req.body ?? {}),
        },
        request,
      ),
    );
    next();
  });
}

function monitorMongo(client) {
  if (!enabled()) {
    return;
  }
  const pending = new Map();
  client.on('commandStarted', (event) => {
    const command = event.command;
    const collection = command[event.commandName];
    if (
      !['messages', 'conversations'].includes(collection) ||
      !['insert', 'update', 'delete', 'findAndModify', 'drop'].includes(event.commandName)
    ) {
      return;
    }
    const details = {
      database: event.databaseName,
      collection,
      operation: event.commandName,
      mongoRequestId: event.requestId,
      operationId: randomUUID(),
    };
    if (pending.size >= 1000) {
      pending.delete(pending.keys().next().value);
      trace('db.monitor.capacity');
    }
    pending.set(event.requestId, { details, request: context.getStore() });
    const operations = command.documents ?? command.updates ?? command.deletes ?? [command];
    for (let offset = 0; offset < operations.length; offset += 100) {
      trace('db.write.start', {
        ...details,
        offset,
        count: operations.length,
        operations: operations.slice(offset, offset + 100).map((op) => ({
          filter: structural(op.q ?? op.query ?? {}),
          update: structural(op.u ?? op.update ?? op),
          upsert: op.upsert,
          multi: op.multi,
          limit: op.limit,
          remove: op.remove,
        })),
      });
    }
  });
  const complete = (event, failed) => {
    const entry = pending.get(event.requestId);
    if (!entry) {
      return;
    }
    pending.delete(event.requestId);
    trace(
      failed ? 'db.write.failed' : 'db.write.end',
      {
        ...entry.details,
        durationMs: event.duration,
        matchedCount: event.reply?.n,
        modifiedCount: event.reply?.nModified,
        value: structural(event.reply?.value),
        writeErrors: event.reply?.writeErrors?.map(({ index, code }) => ({ index, code })),
        errorCode: event.failure?.code,
      },
      entry.request,
    );
  };
  client.on('commandSucceeded', (event) => complete(event, false));
  client.on('commandFailed', (event) => complete(event, true));
}

/** Detect deletions/rewiring even when they originate outside this Node process (e.g. TTL). */
function monitorTopology(db) {
  if (!enabled()) {
    return;
  }
  let previous;
  let running = false;
  const poll = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const messages = await db
        .collection('messages')
        .find(
          {},
          {
            projection: {
              _id: 1,
              messageId: 1,
              parentMessageId: 1,
              conversationId: 1,
              user: 1,
              expiredAt: 1,
            },
          },
        )
        .toArray();
      const rowKey = (message) => String(message._id ?? message.messageId);
      const current = new Map(messages.map((message) => [rowKey(message), message]));
      if (!previous) {
        traceMessages('db.topology.baseline', messages);
      } else {
        const removed = [...previous.values()].filter((message) => !current.has(rowKey(message)));
        const changed = messages.filter(
          (message) => JSON.stringify(previous.get(rowKey(message))) !== JSON.stringify(message),
        );
        if (removed.length) {
          traceMessages('db.topology.removed', removed, { sampled: true });
        }
        if (changed.length) {
          traceMessages('db.topology.changed', changed, { sampled: true });
        }
      }
      previous = current;
    } catch (error) {
      trace('db.topology.failed', { errorCode: error.code });
    } finally {
      running = false;
    }
  };
  void poll();
  const timer = setInterval(poll, 60000);
  timer.unref();
}

module.exports = {
  getTraceLogger,
  enabled,
  structural,
  trace,
  traceMessages,
  classifyError,
  requestTrace,
  monitorMongo,
  monitorTopology,
};
