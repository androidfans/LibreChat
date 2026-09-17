import { useState, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { CSSTransition } from 'react-transition-group';
import type { TMessage } from 'librechat-data-provider';
import { useScreenshot, useMessageScrolling, useLocalize } from '~/hooks';
import ConversationNavigation from '~/components/Messages/ConversationNavigation';
import { MessagesViewProvider } from '~/Providers';
import { fontSizeAtom } from '~/store/fontSize';
import MultiMessage from './MultiMessage';
import { cn } from '~/utils';
import store from '~/store';

function MessagesViewContent({
  messagesTree: _messagesTree,
}: {
  messagesTree?: TMessage[] | null;
}) {
  const localize = useLocalize();
  const fontSize = useAtomValue(fontSizeAtom);
  const { screenshotTargetRef } = useScreenshot();
  const scrollNavigationPreference = useRecoilValue(store.showScrollButton);
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);
  const scrollNavigationRef = useRef<HTMLDivElement>(null);

  const {
    conversation,
    scrollableRef,
    messagesContentRef,
    messagesEndRef,
    showScrollNavigation,
    isAtTop,
    isAtBottom,
    handleScroll,
    handleScrollToTop,
    handleScrollToNext,
    handleScrollToBottom,
  } = useMessageScrolling(_messagesTree);

  const { conversationId } = conversation ?? {};

  return (
    <>
      <div className="relative flex-1 overflow-hidden overflow-y-auto">
        <div className="relative h-full">
          <div
            className="scrollbar-gutter-stable"
            onScroll={handleScroll}
            ref={scrollableRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              width: '100%',
            }}
          >
            <div ref={messagesContentRef} className="flex flex-col pb-20 dark:bg-transparent">
              {(_messagesTree && _messagesTree.length == 0) || _messagesTree === null ? (
                <div
                  className={cn(
                    'flex w-full items-center justify-center p-3 text-text-secondary',
                    fontSize,
                  )}
                >
                  {localize('com_ui_nothing_found')}
                </div>
              ) : (
                <>
                  <div ref={screenshotTargetRef}>
                    <MultiMessage
                      key={conversationId}
                      messagesTree={_messagesTree}
                      messageId={conversationId ?? null}
                      setCurrentEditId={setCurrentEditId}
                      currentEditId={currentEditId ?? null}
                    />
                  </div>
                </>
              )}
              <div
                id="messages-end"
                className="group h-0 w-full flex-shrink-0"
                ref={messagesEndRef}
              />
            </div>
          </div>

          <CSSTransition
            in={showScrollNavigation && scrollNavigationPreference}
            timeout={{
              enter: 180,
              exit: 140,
            }}
            classNames="scroll-animation"
            unmountOnExit={true}
            appear={true}
            nodeRef={scrollNavigationRef}
          >
            <ConversationNavigation
              ref={scrollNavigationRef}
              isAtTop={isAtTop}
              isAtBottom={isAtBottom}
              onScrollToTop={handleScrollToTop}
              onScrollToNext={handleScrollToNext}
              onScrollToBottom={handleScrollToBottom}
            />
          </CSSTransition>
        </div>
      </div>
    </>
  );
}

export default function MessagesView({ messagesTree }: { messagesTree?: TMessage[] | null }) {
  return (
    <MessagesViewProvider>
      <MessagesViewContent messagesTree={messagesTree} />
    </MessagesViewProvider>
  );
}
