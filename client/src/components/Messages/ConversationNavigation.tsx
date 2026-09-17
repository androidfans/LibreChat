import { forwardRef } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUpToLine } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Props = {
  isAtTop: boolean;
  isAtBottom: boolean;
  onScrollToTop: React.MouseEventHandler<HTMLButtonElement>;
  onScrollToNext: React.MouseEventHandler<HTMLButtonElement>;
  onScrollToBottom: React.MouseEventHandler<HTMLButtonElement>;
};

const buttonClasses = cn(
  'flex h-10 w-10 items-center justify-center rounded-full text-text-secondary',
  'transition-colors hover:bg-surface-tertiary hover:text-text-primary sm:h-9 sm:w-9',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
  'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary',
);

const ConversationNavigation = forwardRef<HTMLDivElement, Props>(
  ({ isAtTop, isAtBottom, onScrollToTop, onScrollToNext, onScrollToBottom }, ref) => {
    const localize = useLocalize();
    const scrollToTopLabel = localize('com_ui_scroll_to_top');
    const scrollToNextLabel = localize('com_ui_scroll_to_next_message');
    const scrollToBottomLabel = localize('com_ui_scroll_to_bottom');

    return (
      <div
        ref={ref}
        className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex justify-center"
      >
        <nav
          className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border-light bg-surface-secondary p-1 shadow-md"
          aria-label={localize('com_ui_conversation_navigation')}
        >
          <button
            type="button"
            className={buttonClasses}
            onClick={onScrollToTop}
            disabled={isAtTop}
            aria-label={scrollToTopLabel}
            title={scrollToTopLabel}
          >
            <ArrowUpToLine className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonClasses}
            onClick={onScrollToNext}
            disabled={isAtBottom}
            aria-label={scrollToNextLabel}
            title={scrollToNextLabel}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonClasses}
            onClick={onScrollToBottom}
            disabled={isAtBottom}
            aria-label={scrollToBottomLabel}
            title={scrollToBottomLabel}
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      </div>
    );
  },
);

ConversationNavigation.displayName = 'ConversationNavigation';

export default ConversationNavigation;
