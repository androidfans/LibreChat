const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint } = require('librechat-data-provider');
const { deleteConvos } = require('~/models/Conversation');
const { deleteConvoSharedLink } = require('~/models');
const { deleteToolCalls } = require('~/models/ToolCall');

const assistantClients = {
  [EModelEndpoint.azureAssistants]: require('~/server/services/Endpoints/azureAssistants'),
  [EModelEndpoint.assistants]: require('~/server/services/Endpoints/assistants'),
};

async function deleteProviderThread({ req, res, endpoint, thread_id }) {
  if (
    !thread_id ||
    typeof endpoint === 'undefined' ||
    !Object.prototype.propertyIsEnumerable.call(assistantClients, endpoint)
  ) {
    return;
  }

  /** @type {{ openai: OpenAI }} */
  const { openai } = await assistantClients[endpoint].initializeClient({ req, res });
  try {
    const response = await openai.beta.threads.delete(thread_id);
    logger.debug('Deleted OpenAI thread:', response);
  } catch (error) {
    logger.error('Error deleting OpenAI thread:', error);
  }
}

async function deleteConversation({ req, res, conversationId, thread_id, endpoint }) {
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  await deleteProviderThread({ req, res, endpoint, thread_id });

  const dbResponse = await deleteConvos(req.user.id, { conversationId });
  await deleteToolCalls(req.user.id, conversationId);
  await deleteConvoSharedLink(req.user.id, conversationId);

  return dbResponse;
}

module.exports = {
  deleteConversation,
  deleteProviderThread,
};
