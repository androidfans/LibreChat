const crypto = require('crypto');
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { createImportLimiters } = require('~/server/middleware');
const requireConversationImportAuth = require('~/server/middleware/requireConversationImportAuth');
const { importConversationData } = require('~/server/utils/import');
const getLogStores = require('~/cache/getLogStores');

const router = express.Router();
const pendingImports = new Map();
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

const { importIpLimiter, importUserLimiter } = createImportLimiters();

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

/**
 * Imports a LibreChat export from an application/json request.
 */
router.post(
  '/v1/conversations/import',
  requireConversationImportAuth,
  importIpLimiter,
  importUserLimiter,
  async (req, res) => {
    const idempotencyKey = req.get('idempotency-key');
    if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return res.status(400).json({ error: 'Idempotency-Key must not exceed 256 characters' });
    }

    const maxBytes = Number(process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES);
    const requestBytes = Buffer.byteLength(JSON.stringify(req.body ?? null));
    if (Number.isFinite(maxBytes) && maxBytes > 0 && requestBytes > maxBytes) {
      return res
        .status(413)
        .json({ error: `Conversation import exceeds the ${maxBytes} byte limit` });
    }

    const keyHash = idempotencyKey
      ? crypto.createHash('sha256').update(`${req.user.id}:${idempotencyKey}`).digest('hex')
      : null;
    const cache = getLogStores(CacheKeys.CONVERSATION_IMPORTS);

    try {
      if (keyHash) {
        const cached = await cache.get(keyHash);
        if (cached) {
          return res.status(200).json({ ...cached, created: false });
        }
        if (pendingImports.has(keyHash)) {
          const pendingResult = await pendingImports.get(keyHash);
          return res.status(200).json({ ...pendingResult, created: false });
        }
      }

      const executeImport = async () => {
        const result = await importConversationData({
          jsonData: req.body,
          requestUserId: req.user.id,
        });
        const response = getImportResponse(req, result, true);
        if (keyHash) {
          await cache.set(keyHash, response);
        }
        return response;
      };

      const importPromise = executeImport();
      if (keyHash) {
        pendingImports.set(keyHash, importPromise);
      }

      try {
        const response = await importPromise;
        return res.status(201).json(response);
      } finally {
        if (keyHash) {
          pendingImports.delete(keyHash);
        }
      }
    } catch (error) {
      logger.error(`External conversation import failed for user ${req.user.id}`, error);
      const unsupported = error?.message === 'Unsupported import type';
      return res.status(unsupported ? 400 : 500).json({
        error: unsupported ? error.message : 'Error importing conversation',
      });
    }
  },
);

module.exports = router;
