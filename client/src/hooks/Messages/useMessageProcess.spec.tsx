import { renderHook } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import useMessageProcess from './useMessageProcess';

const mockSetLatestMessage = jest.fn();
jest.mock('~/Providers', () => ({
  useMessagesViewContext: () => ({
    conversation: { conversationId: 'conversation' },
    setLatestMessage: mockSetLatestMessage,
  }),
}));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/messages'),
  logger: { log: jest.fn() },
}));

it('restores an unchanged message as latest when it becomes a leaf again', () => {
  const message = {
    messageId: 'reply',
    conversationId: 'conversation',
    text: 'An existing reply',
    children: [],
  } as unknown as TMessage;
  const { rerender } = renderHook(useMessageProcess, { initialProps: { message } });
  expect(mockSetLatestMessage).toHaveBeenLastCalledWith(message);

  const descendant = { ...message, messageId: 'later-reply' };
  rerender({ message: { ...message, children: [descendant] } });
  mockSetLatestMessage.mockClear();

  rerender({ message: { ...message } });
  expect(mockSetLatestMessage).toHaveBeenCalledWith(message);

  mockSetLatestMessage.mockClear();
  rerender({ message: { ...message } });
  expect(mockSetLatestMessage).not.toHaveBeenCalled();
});
