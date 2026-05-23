import type { TMessage } from 'librechat-data-provider';

type ResponseAliasSubmission = {
  userMessage?: Pick<TMessage, 'messageId' | 'responseMessageId'> | null;
  initialResponse?: Pick<TMessage, 'messageId'> | null;
};

export const getResponseAliasIds = ({
  submission,
  responseMessageId,
  userMessageId = submission.userMessage?.messageId,
}: {
  submission: ResponseAliasSubmission;
  responseMessageId?: string;
  userMessageId?: string;
}) =>
  new Set(
    [
      responseMessageId,
      submission.initialResponse?.messageId,
      submission.userMessage?.responseMessageId ?? undefined,
      userMessageId ? `${userMessageId}_` : undefined,
    ].filter((id): id is string => Boolean(id)),
  );

export const upsertResponseMessage = ({
  messages,
  response,
  userMessage,
  submission,
}: {
  messages: TMessage[];
  response: TMessage;
  userMessage: TMessage;
  submission: ResponseAliasSubmission;
}) => {
  const aliasIds = getResponseAliasIds({
    submission,
    responseMessageId: response.messageId,
    userMessageId: userMessage.messageId,
  });
  let updatedMessages = messages.filter((message) => !aliasIds.has(message.messageId));

  if (!updatedMessages.some((message) => message.messageId === userMessage.messageId)) {
    updatedMessages = [...updatedMessages, userMessage];
  }

  return [...updatedMessages, response];
};

export const upsertCancelledMessages = ({
  messages,
  requestMessage,
  responseMessage,
  submission,
  isRegenerate,
}: {
  messages: TMessage[];
  requestMessage: TMessage;
  responseMessage: TMessage;
  submission: ResponseAliasSubmission;
  isRegenerate?: boolean;
}) => {
  const responseAliasIds = getResponseAliasIds({
    submission,
    responseMessageId: responseMessage.messageId,
    userMessageId: requestMessage.messageId,
  });
  const userAliasIds = new Set(
    [requestMessage.messageId, submission.userMessage?.messageId].filter((id): id is string =>
      Boolean(id),
    ),
  );
  const baseMessages = messages.filter(
    (message) =>
      !responseAliasIds.has(message.messageId) &&
      (isRegenerate || !userAliasIds.has(message.messageId)),
  );

  if (isRegenerate) {
    return upsertResponseMessage({
      messages: baseMessages,
      response: responseMessage,
      userMessage: requestMessage,
      submission: { ...submission, userMessage: requestMessage },
    });
  }

  return [...baseMessages, requestMessage, responseMessage];
};

export const upsertPersistedRequestMessage = ({
  messages,
  requestMessage,
}: {
  messages: TMessage[];
  requestMessage?: TMessage | null;
}) => {
  if (!requestMessage?.messageId || !requestMessage.conversationId) {
    return [...messages];
  }

  let found = false;
  const updatedMessages = messages.map((message) => {
    if (message.messageId !== requestMessage.messageId) {
      return message;
    }
    found = true;
    return { ...message, ...requestMessage };
  });

  return found ? updatedMessages : [...updatedMessages, requestMessage];
};

export const filterOptimisticSubmissionMessages = ({
  messages,
  submission,
  responseMessageId,
  userMessageId = submission.userMessage?.messageId,
}: {
  messages: TMessage[];
  submission: ResponseAliasSubmission;
  responseMessageId?: string;
  userMessageId?: string;
}) => {
  const responseAliasIds = getResponseAliasIds({
    submission,
    responseMessageId,
    userMessageId,
  });

  return messages.filter(
    (message) => message.messageId !== userMessageId && !responseAliasIds.has(message.messageId),
  );
};
