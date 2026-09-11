import { act, renderHook } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants } from 'librechat-data-provider';
import type { TMessage, TConversation } from 'librechat-data-provider';
import useChatFunctions from '../useChatFunctions';
import store from '~/store';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('~/hooks', () => ({ useAuthContext: () => ({ user: {} }) }));
jest.mock('~/hooks/Files/useSetFilesToDelete', () => () => jest.fn());
jest.mock('~/hooks/Conversations/useGetSender', () => () => () => 'Assistant');
jest.mock('~/hooks/Input/useUserKey', () => () => ({ getExpiry: () => '' }));
jest.mock('~/utils', () => ({
  logger: { log: jest.fn(), dir: jest.fn() },
  removeDrafts: jest.fn(),
  setSubmittedDraft: jest.fn(),
}));
jest.mock('~/store', () => {
  const { atom, atomFamily } = jest.requireActual('recoil');
  const family = (key: string, defaultValue: unknown) =>
    atomFamily({ key: `chat-functions-${key}`, default: defaultValue });
  return {
    __esModule: true,
    useGetEphemeralAgent: () => () => undefined,
    default: {
      isTemporary: atom({ key: 'chat-functions-temporary', default: false }),
      saveDrafts: atom({ key: 'chat-functions-drafts', default: false }),
      messagesSiblingIdxFamily: family('siblings', 0),
      isSubmittingFamily: family('submitting', false),
      showStopButtonByIndex: family('stop', false),
      latestMessageFamily: family('latest', null),
    },
  };
});

const message = (messageId: string, parentMessageId = String(Constants.NO_PARENT)): TMessage =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'conversation',
    text: messageId,
    isCreatedByUser: false,
  }) as TMessage;

describe('useChatFunctions parent selection', () => {
  const messages = [
    message('root'),
    message('first-reply', 'root'),
    message('second-reply', 'root'),
  ];

  const setup = (latestMessage: TMessage | null, siblingIndex = 0) => {
    const setSubmission = jest.fn();
    const setMessages = jest.fn();
    const queryClient = new QueryClient();
    const hook = renderHook(
      () =>
        useChatFunctions({
          conversation: {
            conversationId: 'conversation',
            endpoint: 'openAI',
            model: 'test',
          } as TConversation,
          latestMessage,
          getMessages: () => messages,
          setMessages,
          setSubmission,
          isSubmitting: false,
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <RecoilRoot
              initializeState={({ set }) =>
                set(store.messagesSiblingIdxFamily('root'), siblingIndex)
              }
            >
              {children}
            </RecoilRoot>
          </QueryClientProvider>
        ),
      },
    );
    return { ...hook, setSubmission, setMessages };
  };

  it.each([null, message('missing-response', 'missing-question')])(
    'sends under the visible branch even when the latest-message cache is stale (%s)',
    (latestMessage) => {
      const { result, setSubmission, setMessages } = setup(latestMessage);
      act(() => result.current.ask({ text: 'Follow up' }));
      expect(setSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.objectContaining({ parentMessageId: 'second-reply' }),
        }),
      );
      const updated = setMessages.mock.calls[0][0] as TMessage[];
      expect(updated.slice(0, messages.length)).toEqual(messages);
      expect(updated.some((entry) => entry.messageId === 'missing-response')).toBe(false);
    },
  );

  it('uses an older selected sibling instead of the most recent response', () => {
    const { result, setSubmission } = setup(messages[2], 1);
    act(() => result.current.ask({ text: 'Follow up on the first reply' }));
    expect(setSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({ parentMessageId: 'first-reply' }),
      }),
    );
  });

  it('preserves an explicit parent when editing an earlier message', () => {
    const { result, setSubmission } = setup(messages[2]);
    act(() => result.current.ask({ text: 'Edited question', parentMessageId: 'root' }));
    expect(setSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({ parentMessageId: 'root' }),
      }),
    );
  });
});
