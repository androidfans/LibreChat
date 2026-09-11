const { Constants } = require('librechat-data-provider');

jest.mock('~/models/Message', () => ({ getMessages: jest.fn() }));

const { getMessages } = require('~/models/Message');
const validateChatParent = require('./chatParent');

describe('validateChatParent', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      user: { id: 'user' },
      body: { conversationId: 'conversation', parentMessageId: 'reply' },
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    getMessages.mockResolvedValue([
      { messageId: 'reply', parentMessageId: 'question' },
      { messageId: 'question', parentMessageId: Constants.NO_PARENT },
    ]);
  });

  it('accepts a complete branch regardless of storage order', async () => {
    await validateChatParent(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'conversation', user: 'user' },
      'messageId parentMessageId',
    );
  });

  it.each([undefined, null, Constants.NO_PARENT])('allows a root message (%s)', async (parent) => {
    req.body.parentMessageId = parent;
    await validateChatParent(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('rejects an absent parent before generation starts', async () => {
    req.body.parentMessageId = 'missing-reply';
    await validateChatParent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_MESSAGE_PARENT' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a missing ancestor even when the immediate parent exists', async () => {
    getMessages.mockResolvedValue([{ messageId: 'reply', parentMessageId: 'missing-question' }]);
    await validateChatParent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects cycles instead of hanging', async () => {
    getMessages.mockResolvedValue([
      { messageId: 'reply', parentMessageId: 'question' },
      { messageId: 'question', parentMessageId: 'reply' },
    ]);
    await validateChatParent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the effective conversation for added responses', async () => {
    req.body.overrideConvoId = `effective${Constants.COMMON_DIVIDER}1`;
    await validateChatParent(req, res, next);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'effective', user: 'user' },
      'messageId parentMessageId',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not allow generation when history cannot be loaded', async () => {
    getMessages.mockRejectedValue(new Error('Database unavailable'));
    await validateChatParent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
