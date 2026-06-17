import { Constants } from './config';
import { buildTree } from './messages';
import type { TMessage } from './types';

const message = (messageId: string, parentMessageId: string | null): TMessage =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'convo',
    text: messageId,
  }) as TMessage;

describe('buildTree', () => {
  it('reconstructs parent-child relationships when children are listed before parents', () => {
    const tree = buildTree({
      messages: [
        message('grandchild', 'child'),
        message('child', 'root'),
        message('root', Constants.NO_PARENT),
      ],
    })!;

    expect(tree).toHaveLength(1);
    expect(tree[0].messageId).toBe('root');
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].messageId).toBe('child');
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].messageId).toBe('grandchild');
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it('keeps true orphan messages as roots', () => {
    const tree = buildTree({
      messages: [message('orphan', 'missing-parent'), message('root', Constants.NO_PARENT)],
    })!;

    expect(tree.map((root) => root.messageId)).toEqual(['orphan', 'root']);
  });
});
