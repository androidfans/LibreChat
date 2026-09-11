const { Constants } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { getMessages } = require('~/models/Message');
const { trace } = require('~/server/utils/messageTrace');

/** Reject a broken history before starting generation or saving another orphan message. */
const validateChatParent = async (req, res, next) => {
  const { parentMessageId, overrideConvoId } = req.body;
  if (!parentMessageId || parentMessageId === Constants.NO_PARENT) {
    return next();
  }

  const conversationId = overrideConvoId
    ? overrideConvoId.split(Constants.COMMON_DIVIDER)[0]
    : req.body.conversationId;

  try {
    const messages = conversationId
      ? await getMessages({ conversationId, user: req.user.id }, 'messageId parentMessageId')
      : [];
    const messageMap = new Map(messages.map((message) => [message.messageId, message]));
    const visited = new Set();
    let currentId = parentMessageId;

    while (currentId && currentId !== Constants.NO_PARENT) {
      const message = messageMap.get(currentId);
      if (!message || visited.has(currentId)) {
        trace('history.rejected', {
          conversationId,
          parentMessageId,
          invalidMessageId: currentId,
          reason: message ? 'cycle' : 'missing',
          visitedIds: [...visited].slice(0, 300),
        });
        logger.warn('[validateChatParent] Rejected broken message history', {
          conversationId,
          parentMessageId,
          invalidMessageId: currentId,
        });
        return res.status(409).json({
          code: 'INVALID_MESSAGE_PARENT',
          message:
            'The selected message history is incomplete. Reload the conversation before sending again.',
        });
      }
      visited.add(currentId);
      currentId = message.parentMessageId;
    }

    return next();
  } catch (error) {
    logger.error('[validateChatParent] Error validating message history', error);
    return res.status(500).json({ message: 'Unable to validate message history.' });
  }
};

module.exports = validateChatParent;
