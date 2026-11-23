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

/** @param {unknown} value @param {number} maximum */
function hasAtMostCodePoints(value, maximum) {
  return typeof value !== 'string' || [...value].length <= maximum;
}

const selfAssessmentSchema = new Schema(
  {
    confidence: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isSafeInteger,
    },
    comment: {
      type: String,
      validate: {
        validator: (/** @type {unknown} */ value) =>
          hasAtMostCodePoints(value, 1_000),
        message: 'Self-assessment comment must not exceed 1000 code points',
      },
    },
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
    note: {
      type: String,
      validate: {
        validator: (/** @type {unknown} */ value) =>
          hasAtMostCodePoints(value, 10_000),
        message: 'Session note must not exceed 10000 code points',
      },
    },
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
