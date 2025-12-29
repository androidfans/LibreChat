import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import CollapsibleText from './CollapsibleText';
import { useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { isSubmitting = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);

  const content: ReactElement = useMemo(() => {
    if (!isCreatedByUser) {
      // AI 消息：使用 CollapsibleText 包裹 Markdown
      return <CollapsibleText text={text} isCreatedByUser={isCreatedByUser} isMarkdown={true} />;
    } else if (enableUserMsgMarkdown) {
      // 用户消息启用 Markdown
      return <CollapsibleText text={text} isCreatedByUser={isCreatedByUser} isMarkdown={true} />;
    } else {
      // 用户消息纯文本
      return <CollapsibleText text={text} isCreatedByUser={isCreatedByUser} isMarkdown={false} />;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, text]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
    </div>
  );
});

export default TextPart;
