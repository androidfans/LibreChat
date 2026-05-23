import { LocalStorageKeys } from 'librechat-data-provider';

export const SUBMITTED_DRAFT_PREFIX = 'submittedDraft_';

type SubmittedDraft = {
  text: string;
  conversationId?: string | null;
  fileIds?: string[];
  createdAt: number;
};

export const removeDraft = (id?: string | null) => {
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${id ?? ''}`);
};

export const removeFileDraft = (id?: string | null) => {
  localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${id ?? ''}`);
};

export const setFileDraft = ({ id, fileIds }: { id: string; fileIds?: string[] }) => {
  const normalizedFileIds = Array.from(
    new Set(
      (fileIds ?? []).filter(
        (fileId): fileId is string => typeof fileId === 'string' && fileId.length > 0,
      ),
    ),
  );

  if (normalizedFileIds.length === 0) {
    removeFileDraft(id);
    return;
  }

  localStorage.setItem(`${LocalStorageKeys.FILES_DRAFT}${id}`, JSON.stringify(normalizedFileIds));
};

export const removeDrafts = (id?: string | null) => {
  removeDraft(id);
  removeFileDraft(id);
};

export const clearDraft = removeDraft;

export const encodeBase64 = (plainText: string): string => {
  try {
    const textBytes = new TextEncoder().encode(plainText);
    return btoa(String.fromCharCode(...textBytes));
  } catch {
    return '';
  }
};

export const decodeBase64 = (base64String: string): string => {
  try {
    const bytes = atob(base64String);
    const uint8Array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      uint8Array[i] = bytes.charCodeAt(i);
    }
    return new TextDecoder().decode(uint8Array);
  } catch {
    return '';
  }
};

export const setDraft = ({ id, value }: { id: string; value?: string }) => {
  if (value && value.length > 1) {
    localStorage.setItem(`${LocalStorageKeys.TEXT_DRAFT}${id}`, encodeBase64(value));
    return;
  }
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${id}`);
};

export const getDraft = (id?: string | null): string | null => {
  const savedDraft = localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${id ?? ''}`);
  if (!savedDraft) {
    return null;
  }
  return decodeBase64(savedDraft);
};

const submittedDraftKey = (id?: string | null) => `${SUBMITTED_DRAFT_PREFIX}${id ?? ''}`;

export const setSubmittedDraft = ({
  id,
  text,
  conversationId,
  fileIds,
}: {
  id?: string | null;
  text?: string | null;
  conversationId?: string | null;
  fileIds?: string[];
}) => {
  if (!id || !text) {
    return;
  }

  const normalizedFileIds = Array.from(
    new Set(
      (fileIds ?? []).filter(
        (fileId): fileId is string => typeof fileId === 'string' && fileId.length > 0,
      ),
    ),
  );

  const submittedDraft: SubmittedDraft = {
    text: encodeBase64(text),
    conversationId,
    fileIds: normalizedFileIds,
    createdAt: Date.now(),
  };

  localStorage.setItem(submittedDraftKey(id), JSON.stringify(submittedDraft));
};

export const getSubmittedDraft = (id?: string | null): SubmittedDraft | null => {
  if (!id) {
    return null;
  }

  const rawDraft = localStorage.getItem(submittedDraftKey(id));
  if (!rawDraft) {
    return null;
  }

  try {
    const submittedDraft = JSON.parse(rawDraft) as SubmittedDraft;
    return {
      ...submittedDraft,
      text: decodeBase64(submittedDraft.text),
      fileIds: Array.isArray(submittedDraft.fileIds)
        ? submittedDraft.fileIds.filter(
            (fileId): fileId is string => typeof fileId === 'string' && fileId.length > 0,
          )
        : [],
    };
  } catch {
    removeSubmittedDraft(id);
    return null;
  }
};

export const removeSubmittedDraft = (id?: string | null) => {
  if (!id) {
    return;
  }
  localStorage.removeItem(submittedDraftKey(id));
};
