import { useCallback, useState } from 'react';
import { Constants, QueryKeys, isAssistantsEndpoint } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from 'recoil';
import type { TMessage, TSubmission } from 'librechat-data-provider';
import type { ActiveJobsResponse } from '~/data-provider';
import { useGetMessagesByConvoId, useAbortStreamMutation } from '~/data-provider';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';
import { useAuthContext } from '~/hooks/AuthContext';
import useNewConvo from '~/hooks/useNewConvo';
import { logger } from '~/utils';
import store from '~/store';

// this to be set somewhere else
export default function useChatHelpers(index = 0, paramId?: string) {
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const [filesLoading, setFilesLoading] = useState(false);

  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthContext();
  const abortMutation = useAbortStreamMutation();
  const activeStreamId = useRecoilValue(store.activeStreamIdFamily(index));
  const setStopGenerationRequest = useSetRecoilState(store.stopGenerationRequestFamily(index));

  const { newConversation } = useNewConvo(index);
  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(index);
  const { conversationId, endpoint, endpointType } = conversation ?? {};

  /** Use paramId (from URL) as primary source for query key - this must match what ChatView uses
  Falling back to conversationId (Recoil) only if paramId is not available */
  const queryParam = paramId === 'new' ? paramId : (paramId ?? conversationId ?? '');

  /* Messages: here simply to fetch, don't export and use `getMessages()` instead */

  const { data: _messages } = useGetMessagesByConvoId(queryParam, {
    enabled: isAuthenticated,
  });

  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmittingFamily(index));
  const [latestMessage, setLatestMessage] = useRecoilState(store.latestMessageFamily(index));
  const setSiblingIdx = useSetRecoilState(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );

  const setMessages = useCallback(
    (messages: TMessage[]) => {
      const realConversationId = [...messages]
        .reverse()
        .find(
          (message) =>
            message.conversationId &&
            message.conversationId !== Constants.NEW_CONVO &&
            message.conversationId !== Constants.PENDING_CONVO,
        )?.conversationId;
      // Only write the route cache when it is a new-chat transition or the detected real
      // conversation matches the route. A different real ID indicates a stale/cross-convo update.
      const shouldWriteQueryParam =
        !realConversationId ||
        queryParam === Constants.NEW_CONVO ||
        queryParam === realConversationId;

      if (shouldWriteQueryParam) {
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, queryParam], messages);
      }
      if (realConversationId && realConversationId !== queryParam) {
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, realConversationId], messages);
      } else if (queryParam === Constants.NEW_CONVO && conversationId && conversationId !== 'new') {
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversationId], messages);
      }
    },
    [queryParam, queryClient, conversationId],
  );

  const getMessages = useCallback(() => {
    return queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam]);
  }, [queryParam, queryClient]);

  /* Conversation */
  // const setActiveConvos = useSetRecoilState(store.activeConversations);

  // const setConversation = useCallback(
  //   (convoUpdate: TConversation) => {
  //     _setConversation(prev => {
  //       const { conversationId: convoId } = prev ?? { conversationId: null };
  //       const { conversationId: currentId } = convoUpdate;
  //       if (currentId && convoId && convoId !== 'new' && convoId !== currentId) {
  //         // for now, we delete the prev convoId from activeConversations
  //         const newActiveConvos = { [currentId]: true };
  //         setActiveConvos(newActiveConvos);
  //       }
  //       return convoUpdate;
  //     });
  //   },
  //   [_setConversation, setActiveConvos],
  // );

  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const getCurrentStopTarget = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        const [currentSubmission, currentActiveStreamId] = await Promise.all([
          snapshot.getPromise(store.submissionByIndex(index)),
          snapshot.getPromise(store.activeStreamIdFamily(index)),
        ]);

        return {
          activeStreamId: currentActiveStreamId,
          userMessageId: currentSubmission?.userMessage?.messageId,
          initialResponseId: currentSubmission?.initialResponse?.messageId,
        };
      },
    [index],
  );
  const clearSubmissionIfCurrent = useRecoilCallback(
    ({ snapshot, set }) =>
      async ({
        conversationId: expectedConversationId,
        streamId: expectedStreamId,
        userMessageId: expectedUserMessageId,
        initialResponseId: expectedInitialResponseId,
        allowPendingNew,
      }: {
        conversationId?: string;
        streamId?: string | null;
        userMessageId?: string;
        initialResponseId?: string;
        allowPendingNew?: boolean;
      }) => {
        const [currentSubmission, currentActiveStreamId] = await Promise.all([
          snapshot.getPromise(store.submissionByIndex(index)),
          snapshot.getPromise(store.activeStreamIdFamily(index)),
        ]);
        if (!currentSubmission) {
          return;
        }

        const currentConversationId = currentSubmission.conversation?.conversationId;
        const currentUserMessageConversationId = currentSubmission.userMessage?.conversationId;
        const currentUserMessageId = currentSubmission.userMessage?.messageId;
        const currentInitialResponseId = currentSubmission.initialResponse?.messageId;
        const currentStreamId = (currentSubmission as TSubmission & { resumeStreamId?: string })
          .resumeStreamId;
        const hasExpectedSubmissionIdentity =
          expectedUserMessageId != null || expectedInitialResponseId != null;
        const matchesSubmissionIdentity =
          (expectedUserMessageId != null && currentUserMessageId === expectedUserMessageId) ||
          (expectedInitialResponseId != null &&
            currentInitialResponseId === expectedInitialResponseId);
        const isPendingNewSubmission =
          currentConversationId == null &&
          currentUserMessageConversationId == null &&
          currentActiveStreamId == null;
        const matchesPendingNew =
          isPendingNewSubmission &&
          hasExpectedSubmissionIdentity &&
          matchesSubmissionIdentity &&
          (expectedConversationId === Constants.NEW_CONVO ||
            (allowPendingNew === true && expectedConversationId != null));
        const matchesConversation =
          expectedConversationId != null &&
          (!hasExpectedSubmissionIdentity || matchesSubmissionIdentity) &&
          (currentConversationId === expectedConversationId ||
            currentUserMessageConversationId === expectedConversationId);
        const matchesStream =
          expectedStreamId != null &&
          (currentStreamId === expectedStreamId ||
            currentConversationId === expectedStreamId ||
            currentActiveStreamId === expectedStreamId);

        if (matchesPendingNew || matchesConversation || matchesStream) {
          set(store.submissionByIndex(index), null);
          return;
        }

        logger.debug('conversation', '[useChatHelpers] Skipping stale stop cleanup', {
          expectedConversationId,
          expectedStreamId,
          expectedUserMessageId,
          expectedInitialResponseId,
          allowPendingNew,
          currentConversationId,
          currentUserMessageConversationId,
          currentUserMessageId,
          currentInitialResponseId,
          currentStreamId,
          currentActiveStreamId,
        });
      },
    [index],
  );

  const { ask, regenerate } = useChatFunctions({
    index,
    files,
    setFiles,
    getMessages,
    setMessages,
    isSubmitting,
    conversation,
    latestMessage,
    setSubmission,
    setLatestMessage,
  });

  const continueGeneration = () => {
    if (!latestMessage) {
      console.error('Failed to regenerate the message: latestMessage not found.');
      return;
    }

    const messages = getMessages();

    const parentMessage = messages?.find(
      (element) => element.messageId == latestMessage.parentMessageId,
    );

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isContinued: true, isRegenerate: true, isEdited: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found, or not created by user.',
      );
    }
  };

  /**
   * Stop generation - for non-assistants endpoints, calls abort endpoint first.
   * The abort endpoint will cause the backend to emit a `done` event with `aborted: true`,
   * which will be handled by the SSE event handler to clean up UI.
   * Assistants endpoint has its own abort mechanism via useEventHandlers.abortConversation.
   */
  const stopGenerating = useCallback(async () => {
    const actualEndpoint = endpointType ?? endpoint;
    const isAssistants = isAssistantsEndpoint(actualEndpoint);
    logger.debug('conversation', '[useChatHelpers] stopGenerating called', {
      conversationId,
      activeStreamId,
      endpoint,
      endpointType,
      actualEndpoint,
      isAssistants,
    });
    setStopGenerationRequest((requestId) => requestId + 1);
    const stopTarget = await getCurrentStopTarget();
    const streamIdToAbort = activeStreamId ?? stopTarget.activeStreamId;

    // For non-assistants endpoints (using resumable streams), call abort endpoint first
    const abortConversationId =
      conversationId && conversationId !== Constants.NEW_CONVO ? conversationId : undefined;
    const stopConversationId = abortConversationId ?? conversationId ?? Constants.NEW_CONVO;

    if (!isAssistants && (streamIdToAbort || abortConversationId)) {
      queryClient.setQueryData<ActiveJobsResponse>([QueryKeys.activeJobs], (old) => ({
        activeJobIds: (old?.activeJobIds ?? []).filter(
          (id) => id !== streamIdToAbort && id !== abortConversationId,
        ),
      }));

      try {
        logger.debug('conversation', '[useChatHelpers] Calling abort mutation for:', {
          streamId: streamIdToAbort,
          conversationId: abortConversationId,
        });
        await abortMutation.mutateAsync({
          streamId: streamIdToAbort ?? undefined,
          conversationId: abortConversationId,
        });
        logger.debug('conversation', '[useChatHelpers] Abort mutation succeeded');
        await clearSubmissionIfCurrent({
          conversationId: stopConversationId,
          streamId: streamIdToAbort,
          userMessageId: stopTarget.userMessageId,
          initialResponseId: stopTarget.initialResponseId,
          allowPendingNew: true,
        });
      } catch (error) {
        logger.error('conversation', '[useChatHelpers] Abort failed:', error);
        await clearSubmissionIfCurrent({
          conversationId: stopConversationId,
          streamId: streamIdToAbort,
          userMessageId: stopTarget.userMessageId,
          initialResponseId: stopTarget.initialResponseId,
          allowPendingNew: true,
        });
      }
    } else {
      logger.debug(
        'conversation',
        isAssistants
          ? '[useChatHelpers] Assistants endpoint, clearing current submission'
          : '[useChatHelpers] No concrete stream id available, clearing current submission',
      );
      await clearSubmissionIfCurrent({
        conversationId: stopConversationId,
        streamId: streamIdToAbort,
        userMessageId: stopTarget.userMessageId,
        initialResponseId: stopTarget.initialResponseId,
        allowPendingNew: true,
      });
    }
  }, [
    activeStreamId,
    conversationId,
    endpoint,
    endpointType,
    abortMutation,
    clearSubmissionIfCurrent,
    getCurrentStopTarget,
    queryClient,
    setStopGenerationRequest,
  ]);

  const handleStopGenerating = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    stopGenerating();
  };

  const handleRegenerate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const parentMessageId = latestMessage?.parentMessageId ?? '';
    if (!parentMessageId) {
      console.error('Failed to regenerate the message: parentMessageId not found.');
      return;
    }
    regenerate({ parentMessageId });
  };

  const handleContinue = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    continueGeneration();
    setSiblingIdx(0);
  };

  const [preset, setPreset] = useRecoilState(store.presetByIndex(index));
  const [showPopover, setShowPopover] = useRecoilState(store.showPopoverFamily(index));
  const [abortScroll, setAbortScroll] = useRecoilState(store.abortScrollFamily(index));
  const [optionSettings, setOptionSettings] = useRecoilState(store.optionSettingsFamily(index));

  return {
    newConversation,
    conversation,
    setConversation,
    // getConvos,
    // setConvos,
    isSubmitting,
    setIsSubmitting,
    getMessages,
    setMessages,
    setSiblingIdx,
    latestMessage,
    setLatestMessage,
    resetLatestMessage,
    ask,
    index,
    regenerate,
    stopGenerating,
    handleStopGenerating,
    handleRegenerate,
    handleContinue,
    showPopover,
    setShowPopover,
    abortScroll,
    setAbortScroll,
    preset,
    setPreset,
    optionSettings,
    setOptionSettings,
    files,
    setFiles,
    filesLoading,
    setFilesLoading,
  };
}
