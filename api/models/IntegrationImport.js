const { Time } = require('librechat-data-provider');
const { IntegrationImport } = require('~/db/models');

async function claimIntegrationImport({ keyHash, user }) {
  try {
    const record = await IntegrationImport.create({
      keyHash,
      user,
      status: 'pending',
      expiresAt: new Date(Date.now() + Time.ONE_DAY),
    });
    return { claimed: true, record: record.toObject() };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
    const record = await IntegrationImport.findOne({ keyHash, user }).lean();
    return { claimed: false, record };
  }
}

async function completeIntegrationImport({ keyHash, user, response }) {
  return await IntegrationImport.updateOne(
    { keyHash, user, status: 'pending' },
    { $set: { status: 'completed', response } },
  );
}

module.exports = {
  claimIntegrationImport,
  completeIntegrationImport,
};
