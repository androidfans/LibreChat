const crypto = require('crypto');

/**
 * Authenticates machine-to-machine conversation imports from environment configuration.
 */
function requireConversationImportAuth(req, res, next) {
  const expectedKey = process.env.CONVERSATION_IMPORT_API_KEY;
  const userId = process.env.CONVERSATION_IMPORT_USER_ID;

  if (!expectedKey || !userId) {
    return res.status(503).json({ error: 'External conversation import is not configured' });
  }

  const authorization = req.get('authorization') ?? '';
  const match = authorization.match(/^Bearer (.+)$/i);
  const suppliedKey = match?.[1] ?? '';
  const expectedBuffer = Buffer.from(expectedKey);
  const suppliedBuffer = Buffer.from(suppliedKey);
  const authorized =
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = { id: userId };
  next();
}

module.exports = requireConversationImportAuth;
