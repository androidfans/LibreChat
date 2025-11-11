import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useToastContext, useMediaQuery, ArchiveIcon } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import { useUpdateConversationMutation, useArchiveConvoMutation, useConversationsInfiniteQuery } from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import { useNavigateToConvo, useLocalize, useNewConvo } from '~/hooks';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { ConvoOptions } from './ConvoOptions';
import RenameForm from './RenameForm';
import { cn, logger } from '~/utils';
import ConvoLink from './ConvoLink';

interface ConversationProps {
  conversation: TConversation;
  retainView: () => void;
  toggleNav: () => void;
}

export default function Conversation({ conversation, retainView, toggleNav }: ConversationProps) {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  const currentConvoId = useMemo(() => params.conversationId, [params.conversationId]);
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');

  // 使用和侧边栏相同的查询来获取对话列表
  const { data: conversationsData } = useConversationsInfiniteQuery({}, { enabled: true });
  const allConversations = useMemo(() => {
    return conversationsData ? conversationsData.pages.flatMap((page) => page.conversations).filter(Boolean) as TConversation[] : [];
  }, [conversationsData]);

  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { conversationId, title = '' } = conversation;
  const quickArchiveEnabled = startupConfig?.quickArchiveConversations === true;

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenaming] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const previousTitle = useRef(title);

  const archiveMutation = useArchiveConvoMutation();

  const handleQuickArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const convoId = conversationId ?? '';
    if (!convoId) {
      return;
    }

    // 在归档前找到下一个要导航的对话
    let nextConvo: TConversation | null = null;
    if (currentConvoId === convoId || currentConvoId === 'new') {
      // 使用和侧边栏相同的数据源
      const validConvos = allConversations.filter((c) => !c.isArchived);

      // 找到当前对话的索引
      const currentIndex = validConvos.findIndex((c) => c.conversationId === conversationId);

      if (currentIndex !== -1 && validConvos.length > 1) {
        // 尝试找下一个对话
        if (currentIndex < validConvos.length - 1) {
          nextConvo = validConvos[currentIndex + 1];
        } else if (currentIndex > 0) {
          // 是最后一个，选择上一个
          nextConvo = validConvos[currentIndex - 1];
        }
      }
    }

    archiveMutation.mutate(
      { conversationId: convoId, isArchived: true },
      {
        onSuccess: () => {
          if (currentConvoId === convoId || currentConvoId === 'new') {
            if (nextConvo) {
              // 导航到下一个对话
              navigateToConvo(nextConvo, {
                currentConvoId,
                resetLatestMessage: false,
              });
            } else {
              // 没有其他对话，创建新对话
              newConversation();
              navigate('/c/new', { replace: true });
            }
          }
          queryClient.setQueryData<TConversation[]>([QueryKeys.allConversations], (old) =>
            old?.filter((c) => c.conversationId !== conversationId),
          );
          retainView();
          showToast({
            message: localize('com_ui_archive_success'),
          });
        },
        onError: () => {
          showToast({
            message: localize('com_ui_archive_error'),
            severity: NotificationSeverity.ERROR,
          });
        },
      },
    );
  };

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  const isActiveConvo = useMemo(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return currentConvoId === Constants.NEW_CONVO;
    }

    if (currentConvoId !== Constants.NEW_CONVO) {
      return currentConvoId === conversationId;
    } else {
      const latestConvo = allConversations?.[0];
      return latestConvo?.conversationId === conversationId;
    }
  }, [currentConvoId, conversationId, allConversations]);

  const handleRename = () => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      logger.error('Error renaming conversation', error);
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  const handleNavigation = (ctrlOrMetaKey: boolean) => {
    if (ctrlOrMetaKey) {
      toggleNav();
      const baseUrl = window.location.origin;
      const path = `/c/${conversationId}`;
      window.open(baseUrl + path, '_blank');
      return;
    }

    if (currentConvoId === conversationId || isPopoverActive) {
      return;
    }

    toggleNav();

    if (typeof title === 'string' && title.length > 0) {
      document.title = title;
    }

    navigateToConvo(conversation, {
      currentConvoId,
      resetLatestMessage: !(conversationId ?? '') || conversationId === Constants.NEW_CONVO,
    });
  };

  const convoOptionsProps = {
    title,
    retainView,
    renameHandler: handleRename,
    isActiveConvo,
    conversationId,
    isPopoverActive,
    setIsPopoverActive,
  };

  return (
    <div
      className={cn(
        'group relative flex h-12 w-full items-center rounded-lg transition-colors duration-200 md:h-9',
        isActiveConvo ? 'bg-surface-active-alt' : 'hover:bg-surface-active-alt',
      )}
      role="button"
      tabIndex={renaming ? -1 : 0}
      aria-label={`${title || localize('com_ui_untitled')} conversation`}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        if (e.button === 0) {
          handleNavigation(e.ctrlKey || e.metaKey);
        }
      }}
      onKeyDown={(e) => {
        if (renaming) {
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNavigation(false);
        }
      }}
      style={{ cursor: renaming ? 'default' : 'pointer' }}
      data-testid="convo-item"
    >
      {renaming ? (
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      ) : (
        <ConvoLink
          isActiveConvo={isActiveConvo}
          title={title}
          onRename={handleRename}
          isSmallScreen={isSmallScreen}
          localize={localize}
        >
          <EndpointIcon
            conversation={conversation}
            endpointsConfig={endpointsConfig}
            size={20}
            context="menu-item"
          />
        </ConvoLink>
      )}
      <div
        className={cn(
          'mr-2 flex origin-left gap-1',
          isPopoverActive || isActiveConvo
            ? 'pointer-events-auto max-w-[60px] scale-x-100 opacity-100'
            : 'pointer-events-none max-w-0 scale-x-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:max-w-[60px] group-focus-within:scale-x-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:max-w-[60px] group-hover:scale-x-100 group-hover:opacity-100',
        )}
        aria-hidden={!(isPopoverActive || isActiveConvo)}
      >
        {!renaming && quickArchiveEnabled && (
          <button
            onClick={handleQuickArchive}
            disabled={archiveMutation.isLoading}
            className="flex items-center justify-center rounded-md p-1 text-text-secondary hover:text-blue-600 hover:bg-surface-hover transition-colors"
            title={localize('com_ui_archive')}
          >
            <ArchiveIcon className="h-4 w-4" />
          </button>
        )}
        {!renaming && <ConvoOptions {...convoOptionsProps} />}
      </div>
    </div>
  );
}
