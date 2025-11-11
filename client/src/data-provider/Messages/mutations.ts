import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys, Constants } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useEditArtifact = (
  _options?: t.EditArtifactOptions,
): UseMutationResult<t.TEditArtifactResponse, Error, t.TEditArtifactRequest> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...options } = _options ?? {};
  return useMutation({
    mutationFn: (variables: t.TEditArtifactRequest) => dataService.editArtifact(variables),
    onSuccess: (data, vars, context) => {
      let targetNotFound = true;
      const setMessageData = (conversationId?: string | null) => {
        if (!conversationId) {
          return;
        }
        queryClient.setQueryData<t.TMessage[]>([QueryKeys.messages, conversationId], (prev) => {
          if (!prev) {
            return prev;
          }

          const newArray = [...prev];
          let targetIndex: number | undefined;

          for (let i = newArray.length - 1; i >= 0; i--) {
            if (newArray[i].messageId === vars.messageId) {
              targetIndex = i;
              targetNotFound = false;
              break;
            }
          }

          if (targetIndex == null) {
            return prev;
          }

          newArray[targetIndex] = {
            ...newArray[targetIndex],
            content: data.content,
            text: data.text,
          };

          return newArray;
        });
      };
      setMessageData(data.conversationId);
      if (targetNotFound) {
        console.warn(
          'Edited Artifact Message not found in cache, trying `new` as `conversationId`',
        );
        setMessageData(Constants.NEW_CONVO);
      }

      onSuccess?.(data, vars, context);
    },
    ...options,
  });
};

export const useDeleteMessageSubtree = (
  conversationId: string,
): UseMutationResult<{ deletedCount: number }, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => dataService.deleteMessageSubtree(conversationId, messageId),
    onSuccess: (_data, messageId) => {
      queryClient.setQueryData<t.TMessage[]>([QueryKeys.messages, conversationId], (prev) => {
        if (!prev) {
          return prev;
        }

        const deletedIds = new Set<string>();
        const getDescendants = (parentId: string) => {
          deletedIds.add(parentId);
          for (const message of prev) {
            if (message.parentMessageId === parentId) {
              getDescendants(message.messageId);
            }
          }
        };

        getDescendants(messageId);

        return prev.filter((message) => !deletedIds.has(message.messageId));
      });

      queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
    },
  });
};

