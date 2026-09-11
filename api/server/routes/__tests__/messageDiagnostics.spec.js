const express = require('express');
const request = require('supertest');
jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => {
  if (req.get('Authorization') !== 'Bearer test') {
    return res.sendStatus(401);
  }
  req.user = { id: 'authenticated-user' };
  return next();
});
jest.mock('~/server/utils/messageTrace', () => ({
  enabled: jest.fn(() => true),
  trace: jest.fn(),
}));
const { trace, enabled } = require('~/server/utils/messageTrace');
const router = require('../messageDiagnostics');
const app = express();
app.use(express.json({ limit: '3mb' }));
app.use('/trace', router);
const batch = () => ({
  tabId: 'tab-1',
  events: [
    {
      event: 'cache.graph',
      seq: 1,
      at: new Date().toISOString(),
      conversationId: 'conversation',
      graph: [['reply', 'question', 'conversation']],
    },
  ],
});

describe('browser message diagnostics', () => {
  beforeEach(() => enabled.mockReturnValue(true));

  it('requires authentication and does not accept a supplied user identity', async () => {
    await request(app).post('/trace').send(batch()).expect(401);
    expect(trace).not.toHaveBeenCalled();
    const data = batch();
    Object.assign(data.events[0], { userId: 'forged-user', text: 'private', token: 'secret' });
    await request(app).post('/trace').set('Authorization', 'Bearer test').send(data).expect(204);
    expect(trace).toHaveBeenCalledWith(
      'client.cache.graph',
      expect.objectContaining({ userId: 'authenticated-user', tabId: 'tab-1' }),
    );
    expect(JSON.stringify(trace.mock.calls)).not.toMatch(/private|secret|forged-user/);
  });

  it('rejects malformed and oversized batches before logging', async () => {
    await request(app)
      .post('/trace')
      .set('Authorization', 'Bearer test')
      .send({ ...batch(), events: Array(6).fill(batch().events[0]) })
      .expect(400);
    await request(app)
      .post('/trace')
      .set('Authorization', 'Bearer test')
      .send({ ...batch(), padding: 'x'.repeat(130 * 1024) })
      .expect(413);
    expect(trace).not.toHaveBeenCalled();
  });

  it('is unavailable when tracing is disabled', async () => {
    enabled.mockReturnValue(false);
    await request(app).post('/trace').set('Authorization', 'Bearer test').send(batch()).expect(404);
    expect(trace).not.toHaveBeenCalled();
  });
});
