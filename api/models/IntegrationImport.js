const { Time } = require('librechat-data-provider');
const { IntegrationImport } = require('~/db/models');

let indexesReady;

function ensureIntegrationImportIndexes() {
  if (!indexesReady) {
    // LibreChat disables Mongoose auto-indexing in production. This unique index is part of the
    // correctness of the distributed claim, so create the schema indexes explicitly on first use.
    indexesReady = IntegrationImport.createIndexes().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

async function claimIntegrationImport({ keyHash, user }) {
  await ensureIntegrationImportIndexes();
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
