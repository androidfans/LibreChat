import { LocalStorageKeys } from 'librechat-data-provider';
import { TextDecoder, TextEncoder } from 'util';
import {
  getDraft,
  setDraft,
  removeDraft,
  removeDrafts,
  removeFileDraft,
  getSubmittedDraft,
  setSubmittedDraft,
  removeSubmittedDraft,
  SUBMITTED_DRAFT_PREFIX,
} from '../drafts';

describe('drafts', () => {
  beforeAll(() => {
    Object.assign(globalThis, { TextDecoder, TextEncoder });
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and reads text drafts as per-conversation drafts', () => {
    setDraft({ id: 'new', value: '你好' });

    expect(getDraft('new')).toBe('你好');
    expect(localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}new`)).toBeTruthy();
  });

  it('removes empty and single-character drafts synchronously', () => {
    setDraft({ id: 'new', value: 'hello' });

    setDraft({ id: 'new', value: '' });
    expect(getDraft('new')).toBeNull();

    setDraft({ id: 'new', value: 'hello' });
    setDraft({ id: 'new', value: 'x' });
    expect(getDraft('new')).toBeNull();
  });

  it('removes text and file drafts by conversation id', () => {
    setDraft({ id: 'convo-1', value: 'hello' });
    localStorage.setItem(`${LocalStorageKeys.FILES_DRAFT}convo-1`, JSON.stringify(['file-1']));

    removeDrafts('convo-1');

    expect(getDraft('convo-1')).toBeNull();
    expect(localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}convo-1`)).toBeNull();
  });

  it('stores submitted recovery separately from restorable text drafts', () => {
    setSubmittedDraft({
      id: 'message-1',
      text: 'submitted text',
      conversationId: 'new',
    });

    expect(getDraft('new')).toBeNull();
    expect(getSubmittedDraft('message-1')).toEqual(
      expect.objectContaining({
        text: 'submitted text',
        conversationId: 'new',
      }),
    );
    expect(localStorage.getItem(`${SUBMITTED_DRAFT_PREFIX}message-1`)).toBeTruthy();
  });

  it('removes submitted recovery independently from conversation drafts', () => {
    setDraft({ id: 'new', value: 'draft text' });
    setSubmittedDraft({
      id: 'message-1',
      text: 'submitted text',
      conversationId: 'new',
    });

    removeSubmittedDraft('message-1');

    expect(getSubmittedDraft('message-1')).toBeNull();
    expect(getDraft('new')).toBe('draft text');
  });

  it('cleans up invalid submitted recovery payloads', () => {
    localStorage.setItem(`${SUBMITTED_DRAFT_PREFIX}message-1`, '{invalid');

    expect(getSubmittedDraft('message-1')).toBeNull();
    expect(localStorage.getItem(`${SUBMITTED_DRAFT_PREFIX}message-1`)).toBeNull();
  });

  it('removes only file drafts when requested', () => {
    setDraft({ id: 'convo-1', value: 'draft text' });
    localStorage.setItem(`${LocalStorageKeys.FILES_DRAFT}convo-1`, JSON.stringify(['file-1']));

    removeFileDraft('convo-1');

    expect(getDraft('convo-1')).toBe('draft text');
    expect(localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}convo-1`)).toBeNull();
  });

  it('removes only text drafts when requested', () => {
    setDraft({ id: 'convo-1', value: 'draft text' });
    localStorage.setItem(`${LocalStorageKeys.FILES_DRAFT}convo-1`, JSON.stringify(['file-1']));

    removeDraft('convo-1');

    expect(getDraft('convo-1')).toBeNull();
    expect(localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}convo-1`)).toBeTruthy();
  });
});
