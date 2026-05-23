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
