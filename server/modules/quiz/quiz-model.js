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

const optionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

const questionSnapshotSchema = new Schema(
  {
    questionVersionId: reference,
    type: {
      type: String,
      required: true,
      enum: ['multipleChoice', 'shortAnswer'],
    },
    prompt: { type: String, required: true },
    options: [optionSchema],
    correctOptionId: String,
    acceptedAnswers: [String],
    explanation: { type: String, required: true },
    knowledgeVersionIds: [
      {
        type: Schema.Types.ObjectId,
        required: true,
      },
    ],
  },
  { _id: false },
);

const answerSchema = new Schema(
  {
    questionVersionId: reference,
    optionId: String,
    text: String,
  },
  { _id: false },
);

const resultItemSchema = new Schema(
  {
    questionVersionId: reference,
    isCorrect: { type: Boolean, required: true },
    points: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

export const quizAttemptSchema = new Schema(
  {
    ownerKey,
    deckVersionId: reference,
    sourceSessionId: optionalReference,
    status: {
      type: String,
      required: true,
      enum: ['inProgress', 'submitted'],
      default: 'inProgress',
    },
    questions: {
      type: [questionSnapshotSchema],
      required: true,
      validate: {
        validator: /** @param {unknown[]} val */ (val) =>
          Array.isArray(val) && val.length >= 1 && val.length <= 5,
        message: 'Quiz attempt must have between 1 and 5 questions',
      },
    },
    answers: [answerSchema],
    results: [resultItemSchema],
    score: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Score must be a safe integer',
      },
    },
    total: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Total must be a safe integer',
      },
    },
    submittedAt: Date,
    submitOperationId: String,
    submitPayloadHash: String,
    version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Version must be a safe integer',
      },
    },
    purgeAt: Date,
  },
  { ...options, timestamps: true },
);

quizAttemptSchema.index({ ownerKey: 1, createdAt: -1, _id: -1 });
quizAttemptSchema.index({ ownerKey: 1, sourceSessionId: 1 });

export const QuizAttempt = mongoose.model(
  'QuizAttempt',
  quizAttemptSchema,
  'quiz_attempts',
);
