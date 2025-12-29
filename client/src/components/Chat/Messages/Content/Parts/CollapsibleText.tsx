import { useState, memo, useCallback, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useMessageContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

// 基于渲染高度来判断，假设每行约20px
const MAX_HEIGHT_PX = 400; // 约20行，每行20px
const COLLAPSED_HEIGHT_PX = 200; // 约10行

type SelectionSubscriber = () => void;

const selectionSubscribers = new Set<SelectionSubscriber>();
let selectionListenerAttached = false;

function subscribeToSelectionChange(subscriber: SelectionSubscriber): () => void {
  selectionSubscribers.add(subscriber);

  if (!selectionListenerAttached && typeof document !== 'undefined') {
    document.addEventListener('selectionchange', notifySelectionSubscribers);
    selectionListenerAttached = true;
  }

  return () => {
    selectionSubscribers.delete(subscriber);
    if (
      selectionSubscribers.size === 0 &&
      selectionListenerAttached &&
      typeof document !== 'undefined'
    ) {
      document.removeEventListener('selectionchange', notifySelectionSubscribers);
      selectionListenerAttached = false;
    }
  };
}

function notifySelectionSubscribers() {
  selectionSubscribers.forEach((subscriber) => subscriber());
}

interface CollapsibleTextProps {
  text: string;
  isCreatedByUser: boolean;
  isMarkdown?: boolean;
}

const CollapsibleText = memo(
  ({ text, isCreatedByUser, isMarkdown = false }: CollapsibleTextProps) => {
    const localize = useLocalize();
    const { isLatestMessage = false, messageId = '' } = useMessageContext();

    // 从 localStorage 读取初始折叠状态
    const getInitialExpandedState = useCallback(() => {
      if (!messageId) {
        return true;
      }
      const saved = localStorage.getItem(`message-collapsed-${messageId}`);
      // 如果保存的是 'true'，说明之前是折叠的，所以 isExpanded 应该是 false
      return saved !== 'true';
    }, [messageId]);

    const [isExpanded, setIsExpanded] = useState(getInitialExpandedState);
    const [shouldCollapse, setShouldCollapse] = useState(false);
    const [isHoveredNearBottom, setIsHoveredNearBottom] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 检测内容高度来判断是否需要折叠
    useEffect(() => {
      if (!contentElement) {
        return;
      }

      const checkHeight = () => {
        const height = contentElement.scrollHeight;
        setShouldCollapse(height > MAX_HEIGHT_PX);
      };

      // 立即检查
      checkHeight();

      // 使用 ResizeObserver 监听大小变化
      const resizeObserver = new ResizeObserver(() => {
        checkHeight();
      });

      resizeObserver.observe(contentElement);

      // 延迟检查，确保内容完全渲染（特别是 Markdown）
      const timer = setTimeout(checkHeight, 100);

      return () => {
        resizeObserver.disconnect();
        clearTimeout(timer);
      };
    }, [contentElement, text, isMarkdown, isCreatedByUser]);

    // 检测鼠标是否靠近底部
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const mouseY = e.clientY;
      const containerBottom = rect.bottom;
      const distanceFromBottom = containerBottom - mouseY;

      // 距离底部 150px 以内时显示
      setIsHoveredNearBottom(distanceFromBottom <= 150 && distanceFromBottom >= 0);
    }, []);

    const handleMouseLeave = useCallback(() => {
      setIsHoveredNearBottom(false);
    }, []);

    // 检测文字选择（单例 selectionchange 监听 + 限定在本消息容器内）
    useEffect(() => {
      if (!shouldCollapse) {
        setIsSelecting(false);
        return;
      }

      if (typeof window === 'undefined') {
        return;
      }

      const unsubscribe = subscribeToSelectionChange(() => {
        const container = containerRef.current;
        if (!container) {
          return;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.toString().length === 0) {
          setIsSelecting(false);
          return;
        }

        const anchorNode = selection.anchorNode;
        const focusNode = selection.focusNode;
        const selectionWithinContainer =
          (!!anchorNode && container.contains(anchorNode)) ||
          (!!focusNode && container.contains(focusNode));

        setIsSelecting(selectionWithinContainer);
      });

      return unsubscribe;
    }, [shouldCollapse]);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const wasExpanded = isExpanded;
        const newExpandedState = !wasExpanded;
        setIsExpanded(newExpandedState);

        // 保存折叠状态到 localStorage
        if (messageId) {
          localStorage.setItem(`message-collapsed-${messageId}`, (!newExpandedState).toString());
        }

        // 如果是折叠操作，滚动到整个消息（包括头像和名字）的顶部
        if (wasExpanded && containerRef.current) {
          setTimeout(() => {
            // 向上查找包含整个消息的容器（带有 message-render 类）
            const messageContainer = containerRef.current?.closest('.message-render');

            if (messageContainer) {
              messageContainer.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }
          }, 100); // 等待折叠动画开始
        }
      },
      [isExpanded, messageId],
    );

    if (!shouldCollapse) {
      // 如果不需要折叠，根据 isMarkdown 渲染内容，但需要 ref 来测量高度
      let content: React.ReactNode;
      if (isMarkdown) {
        content = isCreatedByUser ? (
          <MarkdownLite content={text} />
        ) : (
          <Markdown content={text} isLatestMessage={isLatestMessage} />
        );
      } else {
        content = <div className="whitespace-pre-wrap">{text}</div>;
      }

      return <div ref={setContentElement}>{content}</div>;
    }

    // 渲染显示的内容
    const renderContent = () => {
      if (isMarkdown) {
        return isCreatedByUser ? (
          <MarkdownLite content={text} />
        ) : (
          <Markdown content={text} isLatestMessage={isLatestMessage} />
        );
      }
      return <div className="whitespace-pre-wrap">{text}</div>;
    };

    return (
      <div
        ref={containerRef}
        className="group/collapsible-text relative"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={setContentElement}
          className={cn('transition-all duration-300 ease-out')}
          style={{
            maxHeight: isExpanded ? 'none' : `${COLLAPSED_HEIGHT_PX}px`,
            overflow: 'hidden',
          }}
        >
          {renderContent()}
        </div>

        {/* 渐变遮罩 - 折叠状态常驻，展开状态只在鼠标靠近底部且未选择文字时显示 */}
        {(!isExpanded || (isHoveredNearBottom && !isSelecting)) && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 transition-opacity duration-200"
            style={{
              backdropFilter: 'blur(2px)',
              WebkitMaskImage: 'linear-gradient(to top, black 15%, transparent 75%)',
              maskImage: 'linear-gradient(to top, black 15%, transparent 75%)',
            }}
          />
        )}

        {/* 悬浮按钮 - 折叠状态常驻，展开状态只在鼠标靠近底部且未选择文字时显示 */}
        {(!isExpanded || (isHoveredNearBottom && !isSelecting)) && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-center">
            <button
              type="button"
              onClick={handleClick}
              aria-label={isExpanded ? localize('com_ui_collapse') : localize('com_ui_expand')}
              className={cn(
                'pointer-events-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                'text-text-secondary hover:text-text-primary',
                'bg-surface-secondary/90 hover:bg-surface-hover/90 backdrop-blur-sm',
                'border border-border-light shadow-sm',
                'transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
              )}
            >
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform duration-300',
                  isExpanded && 'rotate-180',
                )}
                aria-hidden="true"
              />
              <span className="text-[10px]">
                {isExpanded ? localize('com_ui_collapse') : localize('com_ui_expand')}
              </span>
            </button>
          </div>
        )}
      </div>
    );
  },
);

CollapsibleText.displayName = 'CollapsibleText';

export default CollapsibleText;
