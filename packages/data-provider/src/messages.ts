import type { TFile } from './types/files';
import type { TMessage } from './types';

export type ParentMessage = Omit<TMessage, 'children' | 'depth'> & {
  children: ParentMessage[];
  depth: number;
};
export function buildTree({
  messages,
  fileMap,
}: {
  messages: (TMessage | undefined)[] | null;
  fileMap?: Record<string, TFile>;
}) {
  if (messages === null) {
    return null;
  }

  const messageMap: Record<string, ParentMessage> = {};
  const rootMessages: ParentMessage[] = [];
  const childrenCount: Record<string, number> = {};

  messages.forEach((message) => {
    if (!message) {
      return;
    }
    const parentId = message.parentMessageId ?? '';
    childrenCount[parentId] = (childrenCount[parentId] || 0) + 1;

    const extendedMessage: ParentMessage = {
      ...message,
      children: [],
      depth: 0,
      siblingIndex: childrenCount[parentId] - 1,
    };

    if (message.files && fileMap) {
      extendedMessage.files = message.files.map((file) => fileMap[file.file_id ?? ''] ?? file);
    }

    messageMap[message.messageId] = extendedMessage;
  });

  Object.values(messageMap).forEach((extendedMessage) => {
    const parentId = extendedMessage.parentMessageId ?? '';
    const parentMessage = messageMap[parentId];
    if (parentMessage) {
      parentMessage.children.push(extendedMessage);
    } else {
      rootMessages.push(extendedMessage);
    }
  });

  const assignDepth = (message: ParentMessage, depth: number) => {
    message.depth = depth;
    message.children.forEach((child) => assignDepth(child, depth + 1));
  };
  rootMessages.forEach((message) => assignDepth(message, 0));

  return rootMessages;
}
