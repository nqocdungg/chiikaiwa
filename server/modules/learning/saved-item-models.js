import mongoose from 'mongoose';

const { Schema } = mongoose;
const ownerKey = {
  type: String,
  required: true,
  immutable: true,
  match: /^(user|guest):[0-9a-f]{24}$/,
};
const reference = {
  type: Schema.Types.ObjectId,
  required: true,
  immutable: true,
};
const optionalReference = {
  type: Schema.Types.ObjectId,
  immutable: true,
  validate: {
    validator: /** @param {unknown} value */ (value) => value !== null,
    message: 'Omit optional references instead of using null',
  },
};
const options = /** @type {const} */ ({
  strict: 'throw',
  versionKey: false,
  autoCreate: false,
  autoIndex: false,
  bufferCommands: false,
});

const savedItemSchema = new Schema(
  {
    ownerKey,
    knowledgeId: reference,
    isSaved: { type: Boolean, required: true, default: true },
    savedAt: { type: Date, required: true },
    version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    purgeAt: Date,
  },
  { ...options, timestamps: true },
);

const savedSourceSchema = new Schema(
  {
    savedItemId: reference,
    ownerKey,
    knowledgeId: reference,
    knowledgeVersionId: reference,
    contextKey: { type: String, required: true, immutable: true },
    deckVersionId: reference,
    sessionId: optionalReference,
    scenarioVersionId: optionalReference,
    purgeAt: Date,
  },
  { ...options, timestamps: { createdAt: true, updatedAt: false } },
);

savedSourceSchema.pre('validate', function () {
  if (Boolean(this.sessionId) !== Boolean(this.scenarioVersionId)) {
    this.invalidate(
      'sessionId',
      'Session and scenario must be provided together',
    );
  }
  const contextKey = this.sessionId
    ? `session:${this.sessionId}:${this.scenarioVersionId}:${this.knowledgeVersionId}`
    : `deck:${this.deckVersionId}:${this.knowledgeVersionId}`;
  if (this.contextKey && this.contextKey !== contextKey) {
    this.invalidate(
      'contextKey',
      'Source context does not match its references',
    );
    return;
  }
  this.contextKey = contextKey;
});

export const SavedItem = mongoose.model(
  'SavedItem',
  savedItemSchema,
  'saved_items',
);
export const SavedSource = mongoose.model(
  'SavedSource',
  savedSourceSchema,
  'saved_sources',
);
