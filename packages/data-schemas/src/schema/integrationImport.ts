import { Schema, Document } from 'mongoose';

export interface IIntegrationImport extends Document {
  keyHash: string;
  user: string;
  status: 'pending' | 'completed';
  response?: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const integrationImportSchema = new Schema<IIntegrationImport>(
  {
    keyHash: { type: String, required: true, unique: true, index: true },
    user: { type: String, required: true, index: true },
    status: { type: String, enum: ['pending', 'completed'], required: true },
    response: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

integrationImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default integrationImportSchema;
