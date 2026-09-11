const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { enabled, trace } = require('~/server/utils/messageTrace');

const id = z.string().max(160).nullable().optional();
const ids = z.array(z.string().max(160)).max(300).optional();
const number = z.number().finite().optional();
const eventSchema = z.object({
  event: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,63}$/),
  seq: z.number().int().nonnegative(),
  at: z.string().datetime(),
  conversationId: id,
  routeConversationId: id,
  targetConversationId: id,
  submissionConversationId: id,
  messageId: id,
  parentMessageId: id,
  latestMessageId: id,
  selectedMessageId: id,
  requestMessageId: id,
  responseMessageId: id,
  source: z.string().max(80).optional(),
  reason: z.string().max(80).optional(),
  count: number,
  previousCount: number,
  offset: number,
  siblingIndex: number,
  siblingCount: number,
  status: number,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  preservedCache: z.boolean().optional(),
  isRegenerate: z.boolean().optional(),
  isContinued: z.boolean().optional(),
  isEdited: z.boolean().optional(),
  addedIds: ids,
  removedIds: ids,
  rootIds: ids,
  orphanIds: ids,
  messageIds: ids,
  visibleIds: ids,
  graph: z
    .array(
      z.tuple([
        z.string().max(160),
        z.string().max(160).nullable(),
        z.string().max(160).nullable(),
      ]),
    )
    .max(300)
    .optional(),
});
const batchSchema = z.object({
  tabId: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
  events: z.array(eventSchema).min(1).max(5),
});

const router = express.Router();
router.use((_req, res, next) => (enabled() ? next() : res.sendStatus(404)));
router.use(requireJwtAuth);
// This limiter returns 429 only; it must never invoke the account-ban machinery.
router.use(
  rateLimit({
    windowMs: 60000,
    limit: 120,
    keyGenerator: (req) => String(req.user.id),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
router.post('/', (req, res) => {
  if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 128 * 1024) {
    return res.sendStatus(413);
  }
  const result = batchSchema.safeParse(req.body);
  if (!result.success) {
    return res.sendStatus(400);
  }
  for (const entry of result.data.events) {
    const { event, ...details } = entry;
    trace(`client.${event}`, {
      ...details,
      clientAt: entry.at,
      tabId: result.data.tabId,
      userId: req.user.id,
      source: 'browser',
      clientSource: entry.source,
    });
  }
  return res.sendStatus(204);
});

module.exports = router;
