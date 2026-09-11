import { useRecoilState } from 'recoil';
import { useEffect, useCallback, useRef } from 'react';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import MessageContent from '~/components/Messages/MessageContent';
import MessageParts from './MessageParts';
import Message from './Message';
import store from '~/store';
import { traceMessage } from '~/utils/messageTrace';

export default function MultiMessage({
  // messageId is used recursively here
  messageId,
  messagesTree,
  currentEditId,
  setCurrentEditId,
}: TMessageProps) {
  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));
  const prevLengthRef = useRef<number | undefined>(undefined);
  const selected = messagesTree?.[messagesTree.length - siblingIdx - 1];
  useEffect(() => {
    traceMessage('branch.render', {
      conversationId: selected?.conversationId,
      parentMessageId: messageId,
      selectedMessageId: selected?.messageId,
      siblingIndex: siblingIdx,
      siblingCount: messagesTree?.length ?? 0,
    });
  }, [messageId, selected?.messageId, selected?.conversationId, siblingIdx, messagesTree?.length]);

  const setSiblingIdxRev = useCallback(
    (value: number) => {
      traceMessage('branch.switch', {
        parentMessageId: messageId,
        selectedMessageId: messagesTree?.[value]?.messageId,
        siblingIndex: value,
        siblingCount: messagesTree?.length ?? 0,
        conversationId: messagesTree?.[value]?.conversationId,
      });
      setSiblingIdx((messagesTree?.length ?? 0) - value - 1);
    },
    [messagesTree, messageId, setSiblingIdx],
  );

  useEffect(() => {
    // Only reset siblingIdx when the tree grows (new message submitting),
    // not when switching back to a conversation (which preserves the previous sibling state)
    const currentLength = messagesTree?.length ?? 0;
    if (prevLengthRef.current !== undefined && currentLength > prevLengthRef.current) {
      traceMessage('branch.reset', {
        parentMessageId: messageId,
        reason: 'siblings-grew',
        count: currentLength,
        previousCount: prevLengthRef.current,
      });
      setSiblingIdx(0);
    }
    prevLengthRef.current = currentLength;
  }, [messagesTree?.length, setSiblingIdx, messageId]);

  useEffect(() => {
    if (messagesTree?.length && siblingIdx >= messagesTree.length) {
      traceMessage('branch.reset', {
        parentMessageId: messageId,
        reason: 'index-out-of-bounds',
        siblingIndex: siblingIdx,
        siblingCount: messagesTree.length,
      });
      setSiblingIdx(0);
    }
  }, [siblingIdx, messagesTree?.length, setSiblingIdx, messageId]);

  if (!(messagesTree && messagesTree.length)) {
    return null;
  }

  const message = messagesTree[messagesTree.length - siblingIdx - 1] as TMessage | undefined;

  if (!message) {
    return null;
  }

  if (isAssistantsEndpoint(message.endpoint) && message.content) {
    return (
      <MessageParts
        key={message.messageId}
        message={message}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
        siblingIdx={messagesTree.length - siblingIdx - 1}
        siblingCount={messagesTree.length}
        setSiblingIdx={setSiblingIdxRev}
      />
    );
  } else if (message.content) {
    return (
      <MessageContent
        key={message.messageId}
        message={message}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
        siblingIdx={messagesTree.length - siblingIdx - 1}
        siblingCount={messagesTree.length}
        setSiblingIdx={setSiblingIdxRev}
      />
    );
  }

  return (
    <Message
      key={message.messageId}
      message={message}
      currentEditId={currentEditId}
      setCurrentEditId={setCurrentEditId}
      siblingIdx={messagesTree.length - siblingIdx - 1}
      siblingCount={messagesTree.length}
      setSiblingIdx={setSiblingIdxRev}
    />
  );
}
