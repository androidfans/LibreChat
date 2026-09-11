import { useRecoilCallback } from 'recoil';
import { buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import store from '~/store';

/** Resolve the visible branch at submission time, before message effects have caught up. */
export default function useGetSelectedMessage() {
  return useRecoilCallback(
    ({ snapshot }) =>
      (messages: TMessage[], conversationId: string | null | undefined): TMessage | null => {
        let siblings: TMessage[] | null | undefined = buildTree({ messages });
        let parentId = conversationId;
        let selected: TMessage | null = null;

        while (siblings?.length) {
          const storedIndex = snapshot
            .getLoadable(store.messagesSiblingIdxFamily(parentId))
            .getValue();
          // Match MultiMessage's fallback when a branch has fewer siblings after a refresh.
          const index = storedIndex >= 0 && storedIndex < siblings.length ? storedIndex : 0;
          selected = siblings[siblings.length - index - 1];
          parentId = selected.messageId;
          siblings = selected.children;
        }

        return selected;
      },
    [],
  );
}
