const crypto = require('crypto');
const express = require('express');
const mongoSanitize = require('express-mongo-sanitize');
const { logger } = require('@librechat/data-schemas');
const { createImportLimiters } = require('~/server/middleware');
const requireConversationImportAuth = require('~/server/middleware/requireConversationImportAuth');
const { importConversationData } = require('~/server/utils/import');
const { claimIntegrationImport, completeIntegrationImport } = require('~/models/IntegrationImport');

const router = express.Router();
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

const { importIpLimiter, importUserLimiter } = createImportLimiters();

function parseImportJson(req, res, next) {
  const configuredLimit = Number(process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : '3mb';
  return express.json({
    limit,
    verify: (request, _response, buffer) => {
      request.importBodyBytes = buffer.length;
    },
  })(req, res, next);
}

function sanitizeImportBody(req, _res, next) {
  req.body = mongoSanitize.sanitize(req.body);
  next();
}

function getConversationUrl(req, conversationId) {
  const path = `/c/${conversationId}`;
  const configuredDomain = process.env.DOMAIN_CLIENT?.replace(/\/$/, '');
  return {
    path,
    url: configuredDomain
      ? `${configuredDomain}${path}`
      : `${req.protocol}://${req.get('host')}${path}`,
  };
}

function getImportResponse(req, result, created) {
  const conversation = result.conversations?.[0];
  if (!conversation) {
    throw new Error('Conversation import did not create a conversation');
  }

  const conversationMessages = (result.messages ?? []).filter(
    (message) => message.conversationId === conversation.conversationId,
  );
  const lastMessage = conversationMessages[conversationMessages.length - 1];
  const location = getConversationUrl(req, conversation.conversationId);

  return {
    conversationId: conversation.conversationId,
    messageId: lastMessage?.messageId ?? null,
    path: location.path,
    url: location.url,
    created,
  };
}

function isLibreChatExport(data) {
  return (
    data != null &&
    !Array.isArray(data) &&
    typeof data === 'object' &&
    typeof data.conversationId === 'string' &&
    data.conversationId.length > 0 &&
    (Array.isArray(data.messages) || Array.isArray(data.messagesTree))
  );
}

/**
 * Imports a LibreChat export from an application/json request.
 */
router.post(
  '/v1/conversations/import',
  requireConversationImportAuth,
  importIpLimiter,
  importUserLimiter,
  parseImportJson,
  sanitizeImportBody,
  async (req, res) => {
    const idempotencyKey = req.get('idempotency-key');
    if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return res.status(400).json({ error: 'Idempotency-Key must not exceed 256 characters' });
    }

    const maxBytes = Number(process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES);
    const requestBytes = req.importBodyBytes ?? 0;
    if (Number.isFinite(maxBytes) && maxBytes > 0 && requestBytes > maxBytes) {
      return res
        .status(413)
        .json({ error: `Conversation import exceeds the ${maxBytes} byte limit` });
    }

    if (!isLibreChatExport(req.body)) {
      return res.status(400).json({ error: 'Unsupported import type' });
    }

    const keyHash = idempotencyKey
      ? crypto.createHash('sha256').update(`${req.user.id}:${idempotencyKey}`).digest('hex')
      : null;
    try {
      if (keyHash) {
        const claim = await claimIntegrationImport({ keyHash, user: req.user.id });
        if (!claim.claimed && claim.record?.status === 'completed') {
          return res.status(200).json({ ...claim.record.response, created: false });
        }
        if (!claim.claimed) {
          return res.status(409).json({ error: 'Import with this Idempotency-Key is in progress' });
        }
      }

      const result = await importConversationData({
        jsonData: req.body,
        requestUserId: req.user.id,
      });
      const response = getImportResponse(req, result, true);
      if (keyHash) {
        try {
          await completeIntegrationImport({
            keyHash,
            user: req.user.id,
            response,
          });
        } catch (error) {
          // The import is already durable; retaining the pending claim prevents a retry from duplicating it.
          logger.error(`Failed to complete idempotency record ${keyHash}`, error);
        }
      }
      return res.status(201).json(response);
    } catch (error) {
      // Persistence is a parallel batch, so a failure may be partial; keep any claim to block duplicates.
      logger.error(`External conversation import failed for user ${req.user.id}`, error);
      const unsupported = error?.message === 'Unsupported import type';
      return res.status(unsupported ? 400 : 500).json({
        error: unsupported ? error.message : 'Error importing conversation',
      });
    }
  },
);

module.exports = router;
