import type { TMessage } from 'librechat-data-provider';
import { filterOptimisticSubmissionMessages, upsertResponseMessage } from '../utils';

const message = (overrides: Partial<TMessage>): TMessage =>
  ({
    messageId: 'message-id',
    conversationId: 'convo-id',
    parentMessageId: '00000000-0000-0000-0000-000000000000',
    text: '',
    sender: 'User',
    isCreatedByUser: true,
    ...overrides,
  }) as TMessage;

describe('upsertResponseMessage', () => {
  it('replaces temporary response aliases with the final response', () => {
    const userMessage = message({ messageId: 'user-real', isCreatedByUser: true });
    const finalResponse = message({
      messageId: 'response-real',
      parentMessageId: 'user-real',
      isCreatedByUser: false,
      text: 'done',
    });

    const result = upsertResponseMessage({
      messages: [
        message({ messageId: 'root' }),
        userMessage,
        message({ messageId: 'initial-response', isCreatedByUser: false }),
        message({ messageId: 'user-real_', parentMessageId: 'user-real', isCreatedByUser: false }),
      ],
      response: finalResponse,
      userMessage,
      submission: {
        userMessage: { messageId: 'user-temp', responseMessageId: 'user-real_' },
        initialResponse: { messageId: 'initial-response' },
      },
    });

    expect(result.map((msg) => msg.messageId)).toEqual(['root', 'user-real', 'response-real']);
  });

  it('does not resurrect messages that are absent from the current cache', () => {
    const userMessage = message({ messageId: 'user-real', isCreatedByUser: true });
    const finalResponse = message({
      messageId: 'response-real',
      parentMessageId: 'user-real',
      isCreatedByUser: false,
      text: 'done',
    });

    const result = upsertResponseMessage({
      messages: [message({ messageId: 'root' }), userMessage],
      response: finalResponse,
      userMessage,
      submission: {
        userMessage: { messageId: 'user-real' },
        initialResponse: { messageId: 'user-real_' },
      },
    });

    expect(result.map((msg) => msg.messageId)).toEqual(['root', 'user-real', 'response-real']);
    expect(result.some((msg) => msg.messageId === 'deleted-sibling')).toBe(false);
  });
});

describe('filterOptimisticSubmissionMessages', () => {
  it('removes optimistic user and assistant placeholders before sync appends persisted messages', () => {
    const result = filterOptimisticSubmissionMessages({
      messages: [
        message({ messageId: 'root' }),
        message({ messageId: 'optimistic-user', isCreatedByUser: true }),
        message({ messageId: 'optimistic-response', isCreatedByUser: false }),
        message({ messageId: 'optimistic-user_', isCreatedByUser: false }),
      ],
      submission: {
        userMessage: { messageId: 'optimistic-user', responseMessageId: 'optimistic-user_' },
        initialResponse: { messageId: 'optimistic-response' },
      },
      responseMessageId: 'persisted-response',
      userMessageId: 'optimistic-user',
    });

    expect(result.map((msg) => msg.messageId)).toEqual(['root']);
  });
});
