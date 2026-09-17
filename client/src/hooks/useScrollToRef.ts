import { RefObject, useCallback, useEffect, useMemo } from 'react';
import throttle from 'lodash/throttle';

type TUseScrollToRef = {
  targetRef: RefObject<HTMLDivElement>;
  callback: () => void;
  smoothCallback: () => void;
  scrollableRef?: RefObject<HTMLDivElement>;
};

type ThrottledFunction = (() => void) & {
  cancel: () => void;
  flush: () => void;
};

type ScrollToRefReturn = {
  scrollToRef?: ThrottledFunction;
  handleSmoothToRef: React.MouseEventHandler<HTMLButtonElement>;
};

export default function useScrollToRef({
  targetRef,
  callback,
  smoothCallback,
  scrollableRef,
}: TUseScrollToRef): ScrollToRefReturn {
  const logAndScroll = useCallback(
    (behavior: ScrollBehavior, callbackFn: () => void) => {
      targetRef.current?.scrollIntoView({ behavior });
      callbackFn();
    },
    [targetRef],
  );

  const scrollCurrentMessageToTop = useCallback(
    (behavior: ScrollBehavior, callbackFn: () => void) => {
      if (!scrollableRef?.current) {
        targetRef.current?.scrollIntoView({ behavior });
        callbackFn();
        return;
      }

      const container = scrollableRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerBottom = containerRect.bottom;
      const offset = 80;

      const messages = container.querySelectorAll('.message-render');
      let targetMessage: Element | null = null;

      for (const message of messages) {
        const messageRect = message.getBoundingClientRect();
        if (messageRect.bottom > containerBottom) {
          targetMessage = message;
          break;
        }
      }

      if (targetMessage) {
        const messageRect = targetMessage.getBoundingClientRect();
        const scrollAmount = messageRect.bottom - containerBottom + offset;
        container.scrollTo({
          top: container.scrollTop + scrollAmount,
          behavior,
        });
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior });
      }

      callbackFn();
    },
    [scrollableRef, targetRef],
  );

  const scrollToRef = useMemo(
    () => throttle(() => logAndScroll('auto', callback), 145, { leading: true }),
    [callback, logAndScroll],
  );

  const scrollToRefSmooth = useMemo(
    () =>
      throttle(
        () => {
          const reduceMotion =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          scrollCurrentMessageToTop(reduceMotion ? 'auto' : 'smooth', smoothCallback);
        },
        750,
        { leading: true },
      ),
    [scrollCurrentMessageToTop, smoothCallback],
  );

  useEffect(
    () => () => {
      scrollToRef.cancel();
      scrollToRefSmooth.cancel();
    },
    [scrollToRef, scrollToRefSmooth],
  );

  const handleSmoothToRef: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (event) => {
      event.preventDefault();
      scrollToRef.cancel();
      scrollToRefSmooth();
    },
    [scrollToRef, scrollToRefSmooth],
  );

  return {
    scrollToRef,
    handleSmoothToRef,
  };
}
