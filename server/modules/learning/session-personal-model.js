import mongoose from 'mongoose';

const { Schema } = mongoose;
const ownerKey = {
  type: String,
  required: true,
  immutable: true,
  match: /^(user|guest):[0-9a-f]{24}$/,
};
const nonNegativeVersion = {
  type: Number,
  required: true,
  default: 0,
  min: 0,
  validate: Number.isSafeInteger,
};
const optionalPurgeAt = {
  type: Date,
  validate: {
    validator: /** @param {unknown} value */ (value) => value !== null,
    message: 'Omit purgeAt instead of using null',
  },
};
const schemaOptions = /** @type {const} */ ({
  strict: 'throw',
  versionKey: false,
  autoCreate: false,
  autoIndex: false,
  bufferCommands: false,
});

const selfAssessmentSchema = new Schema(
  {
    confidence: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isSafeInteger,
    },
    comment: { type: String, maxlength: 1_000 },
  },
  { _id: false, strict: 'throw' },
);

const sessionPersonalSchema = new Schema(
  {
    ownerKey,
    sessionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    note: { type: String, maxlength: 10_000 },
    noteVersion: nonNegativeVersion,
    selfAssessment: selfAssessmentSchema,
    version: nonNegativeVersion,
    purgeAt: optionalPurgeAt,
  },
  { ...schemaOptions, timestamps: true },
);

export const SessionPersonal = mongoose.model(
  'SessionPersonal',
  sessionPersonalSchema,
  'session_personal',
);
