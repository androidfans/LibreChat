const express = require('express');
const request = require('supertest');

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('librechat-data-provider', () => ({
  ViolationTypes: { FILE_UPLOAD_LIMIT: 'FILE_UPLOAD_LIMIT' },
}));

jest.mock('~/server/middleware', () => ({
  createImportLimiters: jest.fn(() => ({
    importIpLimiter: (req, res, next) => next(),
    importUserLimiter: (req, res, next) => next(),
  })),
}));

jest.mock('~/server/utils/import', () => ({
  importConversationData: jest.fn(),
}));

jest.mock('~/models/IntegrationImport', () => ({
  claimIntegrationImport: jest.fn(),
  completeIntegrationImport: jest.fn(),
}));

describe('External conversation import', () => {
  const { importConversationData } = require('~/server/utils/import');
  const {
    claimIntegrationImport,
    completeIntegrationImport,
  } = require('~/models/IntegrationImport');
  let app;

  beforeAll(() => {
    app = express();
    app.use('/api/integrations', require('../integrations'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CONVERSATION_IMPORT_API_KEY = 'test-secret';
    process.env.CONVERSATION_IMPORT_USER_ID = 'user-123';
    process.env.DOMAIN_CLIENT = 'https://chat.example.com';
    delete process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
    claimIntegrationImport.mockResolvedValue({ claimed: true });
    completeIntegrationImport.mockResolvedValue({ modifiedCount: 1 });
    importConversationData.mockResolvedValue({
      conversations: [{ conversationId: 'conversation-123' }],
      messages: [{ conversationId: 'conversation-123', messageId: 'message-123' }],
    });
  });

  afterAll(() => {
    delete process.env.CONVERSATION_IMPORT_API_KEY;
    delete process.env.CONVERSATION_IMPORT_USER_ID;
    delete process.env.DOMAIN_CLIENT;
  });

  const payload = {
    conversationId: 'exported-id',
    title: 'Imported chat',
    messages: [{ messageId: 'old-message', text: 'hello' }],
  };

  it('imports a LibreChat export and returns its chat URL', async () => {
    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .set('Idempotency-Key', 'observation-123')
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      conversationId: 'conversation-123',
      messageId: 'message-123',
      path: '/c/conversation-123',
      url: 'https://chat.example.com/c/conversation-123',
      created: true,
    });
    expect(importConversationData).toHaveBeenCalledWith({
      jsonData: { ...payload, options: { tags: ['api-import'] } },
      requestUserId: 'user-123',
    });
    expect(completeIntegrationImport).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid integration token', async () => {
    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer wrong-secret')
      .send(payload);

    expect(response.status).toBe(401);
    expect(importConversationData).not.toHaveBeenCalled();
  });

  it('is unavailable when the target user is not configured', async () => {
    delete process.env.CONVERSATION_IMPORT_USER_ID;

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .set('Idempotency-Key', 'observation-123')
      .send(payload);

    expect(response.status).toBe(503);
    expect(importConversationData).not.toHaveBeenCalled();
  });

  it('returns a cached conversation for an idempotent retry', async () => {
    claimIntegrationImport.mockResolvedValue({
      claimed: false,
      record: {
        status: 'completed',
        response: {
          conversationId: 'existing-conversation',
          messageId: 'existing-message',
          path: '/c/existing-conversation',
          url: 'https://chat.example.com/c/existing-conversation',
          created: true,
        },
      },
    });

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .set('Idempotency-Key', 'observation-123')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(false);
    expect(response.body.conversationId).toBe('existing-conversation');
    expect(importConversationData).not.toHaveBeenCalled();
  });

  it('reports unsupported export data as a bad request', async () => {
    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .send({ invalid: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Unsupported import type');
    expect(importConversationData).not.toHaveBeenCalled();
    expect(claimIntegrationImport).not.toHaveBeenCalled();
  });

  it('rejects multi-conversation export formats before persistence', async () => {
    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .send([{ title: 'ChatGPT export', mapping: {} }]);

    expect(response.status).toBe(400);
    expect(importConversationData).not.toHaveBeenCalled();
    expect(claimIntegrationImport).not.toHaveBeenCalled();
  });

  it('sanitizes MongoDB operator keys before import', async () => {
    const unsafePayload = {
      ...payload,
      options: { model: 'gpt-4', $set: { user: 'attacker' } },
    };

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .send(unsafePayload);

    expect(response.status).toBe(201);
    expect(importConversationData).toHaveBeenCalledWith({
      jsonData: {
        ...unsafePayload,
        options: { model: 'gpt-4', tags: ['api-import'] },
      },
      requestUserId: 'user-123',
    });
  });

  it('marks API imports while preserving caller-provided tags', async () => {
    const taggedPayload = {
      ...payload,
      options: { tags: ['langfuse-import', 'api-import'] },
    };

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .send(taggedPayload);

    expect(response.status).toBe(201);
    expect(importConversationData).toHaveBeenCalledWith({
      jsonData: taggedPayload,
      requestUserId: 'user-123',
    });
  });

  it('does not report success when persistence fails', async () => {
    importConversationData.mockRejectedValue(new Error('Database failure'));

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .set('Idempotency-Key', 'observation-123')
      .send(payload);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Error importing conversation');
    expect(claimIntegrationImport).toHaveBeenCalledTimes(1);
  });

  it('returns success when recording completion fails after persistence', async () => {
    completeIntegrationImport.mockRejectedValue(new Error('Idempotency storage failure'));

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .set('Idempotency-Key', 'observation-123')
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.conversationId).toBe('conversation-123');
  });

  it('rejects a concurrent request while its shared claim is pending', async () => {
    claimIntegrationImport.mockResolvedValue({
      claimed: false,
      record: { status: 'pending' },
    });

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .set('Idempotency-Key', 'observation-123')
      .send(payload);

    expect(response.status).toBe(409);
    expect(importConversationData).not.toHaveBeenCalled();
  });

  it('enforces the configured import size limit', async () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '10';

    const response = await request(app)
      .post('/api/integrations/v1/conversations/import')
      .set('Authorization', 'Bearer test-secret')
      .send(payload);

    expect(response.status).toBe(413);
    expect(importConversationData).not.toHaveBeenCalled();
  });
});
