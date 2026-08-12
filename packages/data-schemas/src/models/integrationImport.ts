import integrationImportSchema, { IIntegrationImport } from '~/schema/integrationImport';

export function createIntegrationImportModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.IntegrationImport ||
    mongoose.model<IIntegrationImport>('IntegrationImport', integrationImportSchema)
  );
}
