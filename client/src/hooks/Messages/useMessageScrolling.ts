import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useMessagesConversation, useMessagesSubmission } from '~/Providers';
import useScrollToRef from '~/hooks/useScrollToRef';
import store from '~/store';

const SCROLL_EDGE_EPSILON = 4;

type ScrollPosition = {
  canScroll: boolean;
  isAtTop: boolean;
  isAtBottom: boolean;
};

export function getScrollPosition(
  {
    scrollTop,
    scrollHeight,
    clientHeight,
  }: Pick<HTMLDivElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
  contentHeight = scrollHeight,
): ScrollPosition {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const canScroll = contentHeight - clientHeight > SCROLL_EDGE_EPSILON;

  return {
    canScroll,
    isAtTop: !canScroll || scrollTop <= SCROLL_EDGE_EPSILON,
    isAtBottom: !canScroll || maxScrollTop - scrollTop <= SCROLL_EDGE_EPSILON,
  };
}

function getSmoothScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'smooth';
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export default function useMessageScrolling(messagesTree?: TMessage[] | null) {
  const autoScroll = useRecoilValue(store.autoScroll);

  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number>();
  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>({
    canScroll: false,
    isAtTop: true,
    isAtBottom: true,
  });
  const { conversation, conversationId } = useMessagesConversation();
  const { setAbortScroll, isSubmitting, abortScroll } = useMessagesSubmission();

  const updateScrollPosition = useCallback(() => {
    const container = scrollableRef.current;
    if (!container) {
      return;
    }

    const nextPosition = getScrollPosition(container, messagesContentRef.current?.scrollHeight);
    setScrollPosition((currentPosition) => {
      if (
        currentPosition.canScroll === nextPosition.canScroll &&
        currentPosition.isAtTop === nextPosition.isAtTop &&
        currentPosition.isAtBottom === nextPosition.isAtBottom
      ) {
        return currentPosition;
      }

      return nextPosition;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (animationFrameRef.current != null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = undefined;
      updateScrollPosition();
    });
  }, [updateScrollPosition]);

  useEffect(() => {
    const container = scrollableRef.current;
    const content = messagesContentRef.current;
    updateScrollPosition();

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleScroll);
    if (container) {
      resizeObserver?.observe(container);
    }
    if (content) {
      resizeObserver?.observe(content);
    }

    return () => {
      resizeObserver?.disconnect();
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [conversationId, handleScroll, messagesTree?.length, updateScrollPosition]);

  const handleNextScrollComplete = useCallback(() => {
    handleScroll();
    if (isSubmitting) {
      setAbortScroll(true);
    }
  }, [handleScroll, isSubmitting, setAbortScroll]);

  const { scrollToRef: scrollToBottom, handleSmoothToRef } = useScrollToRef({
    targetRef: messagesEndRef,
    callback: handleScroll,
    smoothCallback: handleNextScrollComplete,
    scrollableRef,
  });

  const handleScrollToTop: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (event) => {
      event.preventDefault();
      scrollToBottom?.cancel();
      if (isSubmitting) {
        setAbortScroll(true);
      }
      scrollableRef.current?.scrollTo({ top: 0, behavior: getSmoothScrollBehavior() });
      handleScroll();
    },
    [handleScroll, isSubmitting, scrollToBottom, setAbortScroll],
  );

  const handleScrollToBottom: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (event) => {
      event.preventDefault();
      setAbortScroll(false);
      const container = scrollableRef.current;
      container?.scrollTo({ top: container.scrollHeight, behavior: getSmoothScrollBehavior() });
      handleScroll();
    },
    [handleScroll, setAbortScroll],
  );

  useEffect(() => {
    if (!messagesTree || messagesTree.length === 0) {
      return;
    }

    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (abortScroll === true) {
      scrollToBottom?.cancel();
      return;
    }

    if (isSubmitting && scrollToBottom) {
      scrollToBottom();
    }
  }, [isSubmitting, messagesTree, scrollToBottom, abortScroll]);

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (scrollToBottom && autoScroll && conversationId !== Constants.NEW_CONVO) {
      scrollToBottom();
    }
  }, [autoScroll, conversationId, scrollToBottom]);

  return {
    conversation,
    scrollableRef,
    messagesContentRef,
    messagesEndRef,
    scrollToBottom,
    showScrollNavigation: scrollPosition.canScroll,
    isAtTop: scrollPosition.isAtTop,
    isAtBottom: scrollPosition.isAtBottom,
    handleScroll,
    handleScrollToTop,
    handleScrollToNext: handleSmoothToRef,
    handleScrollToBottom,
  };
}
