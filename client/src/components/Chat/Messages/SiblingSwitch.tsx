import { useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TMessageProps } from '~/common';
import { cn } from '~/utils';

type TSiblingSwitchProps = Pick<TMessageProps, 'siblingIdx' | 'siblingCount' | 'setSiblingIdx'> & {
  /**
   * Stable key shared by all siblings under the same parent.
   * Used to re-find the new nav element after the current one unmounts.
   */
  scrollKey?: string | null;
};

const SCROLL_RETRY_DELAY_MS = 50;
const SCROLL_RETRY_LIMIT = 5;
const KEEP_VISIBLE_TIMEOUT_MS = 1200;
const BOTTOM_GAP_PX = 80;

function escapeAttributeValue(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, '\\$&');
}

function findScrollContainer(element: Element): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const isScrollableOverflow = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (isScrollableOverflow && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export default function SiblingSwitch({
  siblingIdx,
  siblingCount,
  setSiblingIdx,
  scrollKey,
}: TSiblingSwitchProps) {
  const containerRef = useRef<HTMLElement>(null);

  const ensureVisible = useCallback((messageContainer: HTMLElement, behavior: ScrollBehavior) => {
    const scrollContainer = findScrollContainer(messageContainer);
    if (!scrollContainer) {
      messageContainer.scrollIntoView({ behavior, block: 'nearest' });
      return;
    }

    messageContainer.scrollIntoView({ behavior, block: 'nearest' });

    const containerRect = scrollContainer.getBoundingClientRect();
    const messageRect = messageContainer.getBoundingClientRect();

    const topLimit = containerRect.top;
    const bottomLimit = containerRect.bottom - BOTTOM_GAP_PX;

    if (messageRect.bottom > bottomLimit) {
      const delta = messageRect.bottom - bottomLimit;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + delta,
        behavior,
      });
      return;
    }

    if (messageRect.top < topLimit) {
      const delta = messageRect.top - topLimit;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + delta,
        behavior,
      });
    }
  }, []);

  const keepVisible = useCallback((messageContainer: Element) => {
    if (typeof ResizeObserver !== 'function') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!(messageContainer instanceof HTMLElement) || !messageContainer.isConnected) {
        observer.disconnect();
        return;
      }

      ensureVisible(messageContainer, 'instant');
    });

    observer.observe(messageContainer);
    setTimeout(() => observer.disconnect(), KEEP_VISIBLE_TIMEOUT_MS);
  }, [ensureVisible]);

  const scrollToMessage = useCallback(
    (attempt = 0) => {
      const navElement =
        containerRef.current ??
        (scrollKey
          ? (document.querySelector(
              `[data-sibling-scroll-key="${escapeAttributeValue(scrollKey)}"]`,
            ) as HTMLElement | null)
          : null);

      const messageContainer = navElement?.closest('.message-render');
      if (messageContainer) {
        const behavior: ScrollBehavior = attempt === 0 ? 'smooth' : 'instant';
        ensureVisible(messageContainer as HTMLElement, behavior);
        keepVisible(messageContainer);
        return;
      }

      if (attempt >= SCROLL_RETRY_LIMIT) {
        return;
      }

      setTimeout(() => scrollToMessage(attempt + 1), SCROLL_RETRY_DELAY_MS);
    },
    [ensureVisible, keepVisible, scrollKey],
  );

  const scheduleScrollToMessage = useCallback(() => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => scrollToMessage());
      return;
    }

    setTimeout(() => scrollToMessage(), 0);
  }, [scrollToMessage]);

  if (siblingIdx === undefined) {
    return null;
  } else if (siblingCount === undefined) {
    return null;
  }

  const previous = () => {
    setSiblingIdx && setSiblingIdx(siblingIdx - 1);
    scheduleScrollToMessage();
  };

  const next = () => {
    setSiblingIdx && setSiblingIdx(siblingIdx + 1);
    scheduleScrollToMessage();
  };

  const buttonStyle = cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt',
    'hover:text-text-primary hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
  );

  return siblingCount > 1 ? (
    <nav
      ref={containerRef}
      className="visible flex items-center justify-center gap-2 self-center pt-0 text-xs"
      data-sibling-scroll-key={scrollKey ?? ''}
      aria-label="Sibling message navigation"
    >
      <button
        className={buttonStyle}
        type="button"
        onClick={previous}
        disabled={siblingIdx == 0}
        aria-label="Previous sibling message"
        aria-disabled={siblingIdx == 0}
      >
        <ChevronLeft size="19" aria-hidden="true" />
      </button>
      <span
        className="flex-shrink-0 flex-grow tabular-nums"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {siblingIdx + 1} / {siblingCount}
      </span>
      <button
        className={buttonStyle}
        type="button"
        onClick={next}
        disabled={siblingIdx == siblingCount - 1}
        aria-label="Next sibling message"
        aria-disabled={siblingIdx == siblingCount - 1}
      >
        <ChevronRight size="19" aria-hidden="true" />
      </button>
    </nav>
  ) : null;
}
