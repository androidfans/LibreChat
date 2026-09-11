import { act, renderHook } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import useGetSelectedMessage from './useGetSelectedMessage';
import store from '~/store';

jest.mock('~/store', () => {
  const { atomFamily } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      messagesSiblingIdxFamily: atomFamily({ key: 'selected-message-test', default: 0 }),
    },
  };
});

const message = (messageId: string, parentMessageId = String(Constants.NO_PARENT)): TMessage =>
  ({ messageId, parentMessageId, conversationId: 'conversation', text: messageId }) as TMessage;

describe('useGetSelectedMessage', () => {
  it('uses the selected branch immediately and keeps new messages attached to its ancestors', () => {
    const messages = [
      message('root'),
      message('reply', 'root'),
      ...[1, 2, 3, 4].map((index) => message(`branch-${index}`, 'reply')),
    ];
    const { result } = renderHook(
      () => ({
        getSelectedMessage: useGetSelectedMessage(),
        setSibling: useSetRecoilState(store.messagesSiblingIdxFamily('reply')),
      }),
      { wrapper: RecoilRoot },
    );

    for (const index of [0, 1, 2, 3, 0]) {
      act(() => result.current.setSibling(index));
      const selected = result.current.getSelectedMessage(messages, 'conversation');
      expect(selected?.messageId).toBe(`branch-${4 - index}`);
      const tree = buildTree({
        messages: [...messages, message('follow-up', selected?.messageId)],
      });
      expect(tree).toHaveLength(1);
      expect(tree?.[0].messageId).toBe('root');
      expect(tree?.[0].children[0].children[3 - index].children[0].messageId).toBe('follow-up');
    }
  });

  it('resolves an older leaf again when refreshed messages no longer contain its descendants', () => {
    const messages = [message('root'), message('reply', 'root'), message('later', 'reply')];
    const { result } = renderHook(useGetSelectedMessage, { wrapper: RecoilRoot });
    expect(result.current(messages, 'conversation')?.messageId).toBe('later');
    expect(result.current(messages.slice(0, 2), 'conversation')?.messageId).toBe('reply');
  });

  it('follows saved root selection and tolerates unordered messages', () => {
    const messages = [message('reply', 'root'), message('root'), message('other-root')];
    const { result } = renderHook(useGetSelectedMessage, {
      wrapper: ({ children }) => (
        <RecoilRoot
          initializeState={({ set }) => set(store.messagesSiblingIdxFamily('conversation'), 1)}
        >
          {children}
        </RecoilRoot>
      ),
    });
    expect(result.current(messages, 'conversation')?.messageId).toBe('reply');
  });

  it('uses the same index fallback as the rendered tree after siblings disappear', () => {
    const { result } = renderHook(useGetSelectedMessage, {
      wrapper: ({ children }) => (
        <RecoilRoot initializeState={({ set }) => set(store.messagesSiblingIdxFamily('root'), 3)}>
          {children}
        </RecoilRoot>
      ),
    });
    expect(
      result.current([message('root'), message('reply', 'root')], 'conversation')?.messageId,
    ).toBe('reply');
    expect(result.current([], 'conversation')).toBeNull();
  });
});
