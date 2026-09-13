import { act, renderHook, waitFor } from '@testing-library/react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants, ContentTypes, request } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { StreamStatusResponse } from '~/data-provider/SSE/queries';
import { streamStatusQueryKey } from '~/data-provider/SSE/queries';
import useResumeOnLoad from '../useResumeOnLoad';
import store from '~/store';

jest.mock('~/data-provider', () => ({
  useStreamStatus: jest.requireActual('~/data-provider/SSE/queries').useStreamStatus,
}));
jest.mock('~/utils', () => ({ updateConvoInAllQueries: jest.fn() }));
jest.mock('~/store', () => {
  const { atom, atomFamily } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      resumableStreams: atom({ key: 'resume-on-load-enabled', default: true }),
      submissionByIndex: atomFamily({ key: 'resume-on-load-submission', default: null }),
    },
  };
});

const conversationId = 'conversation';
const message = (messageId: string, parentMessageId: string, isCreatedByUser = true) =>
  ({ messageId, parentMessageId, conversationId, isCreatedByUser, text: '' }) as TMessage;
const messages = [
  message('root', Constants.NO_PARENT),
  message('original-question', 'root'),
  message('original-reply', 'original-question', false),
  message('edited-question', 'root'),
  message('edited-reply', 'edited-question', false),
];
const getMessages = () => messages;
const statusFor = (branch: string): StreamStatusResponse => ({
  active: true,
  streamId: conversationId,
  resumeState: {
    userMessage: { messageId: `${branch}-question`, parentMessageId: 'root', conversationId },
    responseMessageId: `${branch}-reply`,
    runSteps: [],
    aggregatedContent: [{ type: ContentTypes.THINK, think: `${branch} reasoning` }],
  },
});

describe('useResumeOnLoad', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
  });

  const setup = (cachedStatus?: StreamStatusResponse) => {
    if (cachedStatus) {
      queryClient.setQueryData(streamStatusQueryKey(conversationId), cachedStatus, {
        updatedAt: Date.now() - 60_000,
      });
    }
    let resolveStatus!: (status: StreamStatusResponse) => void;
    const pendingStatus = new Promise<StreamStatusResponse>((resolve) => {
      resolveStatus = resolve;
    });
    const fetchStatus = jest.spyOn(request, 'get').mockReturnValueOnce(pendingStatus);
    const hook = renderHook(
      () => {
        useResumeOnLoad(conversationId, getMessages);
        return useRecoilValue(store.submissionByIndex(0));
      },
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <RecoilRoot>{children}</RecoilRoot>
          </QueryClientProvider>
        ),
      },
    );
    return { ...hook, fetchStatus, resolveStatus };
  };

  it.each(['edited', 'original'])(
    'waits for the status refresh before resuming the %s question',
    async (branch) => {
      const { result, fetchStatus, resolveStatus } = setup(statusFor('original'));
      await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
      expect(queryClient.getQueryState(streamStatusQueryKey(conversationId))?.status).toBe(
        'success',
      );
      expect(result.current).toBeNull();

      // The unchanged result also needs to resume when fetching ends (structural sharing).
      const freshStatus = statusFor(branch);
      await act(async () => resolveStatus(freshStatus));

      await waitFor(() => expect(result.current?.userMessage.messageId).toBe(`${branch}-question`));
      expect(result.current?.initialResponse).toEqual(
        expect.objectContaining({
          messageId: `${branch}-reply`,
          parentMessageId: `${branch}-question`,
          content: freshStatus.resumeState?.aggregatedContent,
        }),
      );
      expect(result.current?.messages).toEqual(messages);
    },
  );

  it('does not resume a cached active job when the refreshed status is inactive', async () => {
    const { result, fetchStatus, resolveStatus } = setup(statusFor('original'));
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
    await act(async () => resolveStatus({ active: false }));
    await waitFor(() =>
      expect(queryClient.isFetching({ queryKey: streamStatusQueryKey(conversationId) })).toBe(0),
    );
    expect(result.current).toBeNull();
  });

  it('resumes the current generation on a fresh page load', async () => {
    const { result, fetchStatus, resolveStatus } = setup();
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
    await act(async () => resolveStatus(statusFor('edited')));
    await waitFor(() => expect(result.current?.userMessage.messageId).toBe('edited-question'));
    expect(result.current?.initialResponse?.parentMessageId).toBe('edited-question');
  });
});
