import { RefObject, useCallback } from 'react';
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
  const logAndScroll = (behavior: 'instant' | 'smooth', callbackFn: () => void) => {
    // Debugging:
    // console.log(`Scrolling with behavior: ${behavior}, Time: ${new Date().toISOString()}`);
    targetRef.current?.scrollIntoView({ behavior });
    callbackFn();
  };

  const scrollCurrentMessageToTop = (behavior: 'instant' | 'smooth', callbackFn: () => void) => {
    if (!scrollableRef?.current) {
      // fallback to scrollIntoView
      targetRef.current?.scrollIntoView({ behavior });
      callbackFn();
      return;
    }

    const container = scrollableRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerBottom = containerRect.bottom;
    // Offset to show a bit of the next message and avoid covering UI elements
    const offset = 80;

    // Find all message elements in the container
    const messages = container.querySelectorAll('.message-render');
    let targetMessage: Element | null = null;

    // Find the message whose bottom is below the visible area
    for (const message of messages) {
      const messageRect = message.getBoundingClientRect();
      if (messageRect.bottom > containerBottom) {
        targetMessage = message;
        break;
      }
    }

    if (targetMessage) {
      const messageRect = targetMessage.getBoundingClientRect();
      // Scroll so message bottom aligns with container bottom, plus offset to reveal next message
      const scrollAmount = messageRect.bottom - containerBottom + offset;
      container.scrollTo({
        top: container.scrollTop + scrollAmount,
        behavior,
      });
    }

    callbackFn();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToRef = useCallback(
    throttle(() => logAndScroll('instant', callback), 145, { leading: true }),
    [targetRef],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToRefSmooth = useCallback(
    throttle(() => scrollCurrentMessageToTop('smooth', smoothCallback), 750, { leading: true }),
    [targetRef, scrollableRef],
  );

  const handleSmoothToRef: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    scrollToRefSmooth();
  };

  return {
    scrollToRef,
    handleSmoothToRef,
  };
}
