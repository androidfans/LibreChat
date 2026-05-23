import type { TMessage } from 'librechat-data-provider';
import {
  filterOptimisticSubmissionMessages,
  upsertCancelledMessages,
  upsertPersistedRequestMessage,
  upsertResponseMessage,
} from '../utils';

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

  it('replaces an optimistic user alias with the persisted user message', () => {
    const persistedUser = message({ messageId: 'persisted-user', text: 'hello' });
    const finalResponse = message({
      messageId: 'persisted-response',
      parentMessageId: 'persisted-user',
      isCreatedByUser: false,
      text: 'done',
    });

    const result = upsertResponseMessage({
      messages: [
        message({ messageId: 'root' }),
        message({ messageId: 'optimistic-user', text: 'hello' }),
        message({
          messageId: 'optimistic-response',
          parentMessageId: 'optimistic-user',
          isCreatedByUser: false,
        }),
      ],
      response: finalResponse,
      userMessage: persistedUser,
      submission: {
        userMessage: { messageId: 'optimistic-user', responseMessageId: 'optimistic-user_' },
        initialResponse: {
          messageId: 'optimistic-response',
          parentMessageId: 'optimistic-user',
        },
      },
    });

    expect(result.map((msg) => msg.messageId)).toEqual([
      'root',
      'persisted-user',
      'persisted-response',
    ]);
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

describe('upsertCancelledMessages', () => {
  it('replaces optimistic turn messages with cancelled persisted messages', () => {
    const requestMessage = message({ messageId: 'persisted-user', text: 'stop me' });
    const responseMessage = message({
      messageId: 'persisted-response',
      parentMessageId: 'persisted-user',
      isCreatedByUser: false,
      text: 'cancelled',
    });

    const result = upsertCancelledMessages({
      messages: [
        message({ messageId: 'root' }),
        message({ messageId: 'optimistic-user', text: 'stop me' }),
        message({ messageId: 'optimistic-response', parentMessageId: 'optimistic-user' }),
        message({ messageId: 'persisted-response', parentMessageId: 'persisted-user' }),
      ],
      requestMessage,
      responseMessage,
      submission: {
        userMessage: { messageId: 'optimistic-user', responseMessageId: 'optimistic-user_' },
        initialResponse: { messageId: 'optimistic-response' },
      },
    });

    expect(result.map((msg) => msg.messageId)).toEqual([
      'root',
      'persisted-user',
      'persisted-response',
    ]);
  });

  it('keeps the existing user message in place when regenerating a cancelled response', () => {
    const requestMessage = message({ messageId: 'existing-user' });
    const responseMessage = message({
      messageId: 'new-response',
      parentMessageId: 'existing-user',
      isCreatedByUser: false,
      text: 'cancelled',
    });

    const result = upsertCancelledMessages({
      messages: [
        message({ messageId: 'root' }),
        requestMessage,
        message({ messageId: 'old-response_', parentMessageId: 'existing-user' }),
      ],
      requestMessage,
      responseMessage,
      submission: {
        userMessage: { messageId: 'existing-user', responseMessageId: 'old-response_' },
        initialResponse: { messageId: 'old-response_' },
      },
      isRegenerate: true,
    });

    expect(result.map((msg) => msg.messageId)).toEqual(['root', 'existing-user', 'new-response']);
  });
});

describe('upsertPersistedRequestMessage', () => {
  it('appends a persisted request message to the submitted base messages', () => {
    const requestMessage = message({ messageId: 'persisted-user', text: 'saved' });

    const result = upsertPersistedRequestMessage({
      messages: [message({ messageId: 'root' })],
      requestMessage,
    });

    expect(result.map((msg) => msg.messageId)).toEqual(['root', 'persisted-user']);
  });

  it('does not append a request message without a persisted conversation id', () => {
    const result = upsertPersistedRequestMessage({
      messages: [message({ messageId: 'root' })],
      requestMessage: message({ messageId: 'optimistic-user', conversationId: undefined }),
    });

    expect(result.map((msg) => msg.messageId)).toEqual(['root']);
  });
});
