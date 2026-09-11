import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, setMessageTraceTab } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import {
  messageTraceEnabled,
  messageTraceTabId,
  setMessageTraceToken,
  traceMessage,
  traceMessageGraph,
  messageGraph,
} from '~/utils/messageTrace';

export default function useMessageTrace() {
  const { token, isAuthenticated } = useAuthContext();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!messageTraceEnabled) {
      return;
    }
    setMessageTraceToken(isAuthenticated ? token : undefined);
    setMessageTraceTab(isAuthenticated ? messageTraceTabId : undefined);
  }, [token, isAuthenticated]);

  useEffect(
    () => () => {
      setMessageTraceToken(undefined);
      setMessageTraceTab(undefined);
    },
    [],
  );

  useEffect(() => {
    if (isAuthenticated && messageTraceEnabled) {
      traceMessage('route', { conversationId: pathname.match(/\/c\/([^/]+)/)?.[1] });
    }
  }, [pathname, isAuthenticated]);

  useEffect(() => {
    if (!messageTraceEnabled || !isAuthenticated) {
      return;
    }
    const snapshots = new Map<string, string>();
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] !== QueryKeys.messages) {
        return;
      }
      const conversationId = String(event.query.queryKey[1] ?? '');
      if (event.type === 'removed') {
        snapshots.delete(event.query.queryHash);
        traceMessage('cache.removed', { conversationId });
        return;
      }
      const messages = event.query.state.data as TMessage[] | undefined;
      if (!messages) {
        return;
      }
      const signature = JSON.stringify(messageGraph(messages));
      if (snapshots.get(event.query.queryHash) === signature) {
        return;
      }
      const previous = snapshots.get(event.query.queryHash);
      snapshots.set(event.query.queryHash, signature);
      traceMessageGraph('cache.graph', messages, {
        conversationId,
        source: event.type === 'updated' ? event.action.type : event.type,
        previousCount: previous ? (JSON.parse(previous) as unknown[]).length : 0,
      });
    });
  }, [queryClient, isAuthenticated]);
}
