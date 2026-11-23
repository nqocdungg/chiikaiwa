import mongoose from 'mongoose';
import { FIXTURE_USER_IDS } from './auth-fixtures.js';

const { ObjectId } = mongoose.Types;

export const FIXTURE_CONTENT_IDS = {
  deckA: '657f1f77bcf86cd799439001',
  deckB: '657f1f77bcf86cd799439002',
  scenarioA: '657f1f77bcf86cd799439011',
  scenarioB: '657f1f77bcf86cd799439012',
  questionA: '657f1f77bcf86cd799439021',
  questionB: '657f1f77bcf86cd799439022',
  knowledgeA: '657f1f77bcf86cd799439031',
  knowledgeB: '657f1f77bcf86cd799439032',
  cardOwnerA: '657f1f77bcf86cd799439041',
  cardOwnerB: '657f1f77bcf86cd799439042',
  sessionPractice: '657f1f77bcf86cd799439051',
};

export const FIXTURE_VERSION_IDS = {
  deckAVersion: '757f1f77bcf86cd799439001',
  scenarioAVersion: '757f1f77bcf86cd799439011',
  questionAVersion: '757f1f77bcf86cd799439021',
  knowledgeAVersion: '757f1f77bcf86cd799439031',
  staleScenarioVersion: '757f1f77bcf86cd799439099',
};

/**
 * Multi-owner and versioned fixtures to verify contract CAS, isolation, and lifecycle.
 */
export const CONTENT_FIXTURES = {
  knowledge: {
    _id: new ObjectId(FIXTURE_CONTENT_IDS.knowledgeA),
    kind: /** @type {const} */ ('knowledge'),
    status: /** @type {const} */ ('published'),
    publishedVersionId: new ObjectId(FIXTURE_VERSION_IDS.knowledgeAVersion),
    latestRevision: 1,
    version: 1,
    createdBy: new ObjectId(FIXTURE_USER_IDS.admin),
    updatedBy: new ObjectId(FIXTURE_USER_IDS.admin),
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },

  knowledgeVersion: {
    _id: new ObjectId(FIXTURE_VERSION_IDS.knowledgeAVersion),
    contentId: new ObjectId(FIXTURE_CONTENT_IDS.knowledgeA),
    kind: /** @type {const} */ ('knowledge'),
    revision: 1,
    payload: {
      type: /** @type {const} */ ('vocabulary'),
      expression: 'こんにちは',
      reading: 'konnichiwa',
      meaning: 'Xin chào (buổi trưa)',
      examples: [
        {
          japanese: '皆さん、こんにちは。',
          vietnamese: 'Xin chào mọi người.',
        },
      ],
    },
    publishedAt: new Date('2026-11-01T00:00:00.000Z'),
    publishedBy: new ObjectId(FIXTURE_USER_IDS.admin),
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
  },

  // Two manual cards with distinct owners to verify cross-tenant 404 isolation (07 §2.1)
  manualCards: {
    cardOwnerA: {
      _id: new ObjectId(FIXTURE_CONTENT_IDS.cardOwnerA),
      ownerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
      front: 'Front text for learner A',
      back: 'Back text for learner A',
      status: /** @type {const} */ ('active'),
      version: 0,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    },
    cardOwnerB: {
      _id: new ObjectId(FIXTURE_CONTENT_IDS.cardOwnerB),
      ownerKey: `user:${FIXTURE_USER_IDS.learnerB}`,
      front: 'Front text for learner B',
      back: 'Back text for learner B',
      status: /** @type {const} */ ('active'),
      version: 0,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    },
  },

  // Resource with current version = 3, expectedVersion = 2 to verify 409 VERSION_CONFLICT (07 §2.2)
  staleResource: {
    _id: new ObjectId(FIXTURE_CONTENT_IDS.deckA),
    ownerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
    name: 'Personal Deck with Version 3',
    status: /** @type {const} */ ('active'),
    version: 3,
    expectedStaleVersion: 2,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },

  // Active Session with two members conforming strictly to 06 §6.1
  sessionWithMembers: {
    _id: new ObjectId(FIXTURE_CONTENT_IDS.sessionPractice),
    originKind: /** @type {const} */ ('match'),
    originId: new ObjectId('807f1f77bcf86cd799439099'),
    roomName: 'room-fixture-practice-01',
    status: /** @type {const} */ ('active'),
    version: 5,
    members: [
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        kind: /** @type {const} */ ('user'),
        userId: new ObjectId(FIXTURE_USER_IDS.learnerA),
      },
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerB}`,
        kind: /** @type {const} */ ('user'),
        userId: new ObjectId(FIXTURE_USER_IDS.learnerB),
      },
    ],
    controllerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
    startedAt: new Date('2026-11-05T08:00:00.000Z'),
    activeDurationMs: 120000,
    presence: [
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        connected: true,
      },
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerB}`,
        connected: true,
      },
    ],
    screenShare: {
      state: /** @type {const} */ ('idle'),
      version: 0,
    },
    mediaCleanup: {
      state: /** @type {const} */ ('none'),
      attempts: 0,
    },
    createdAt: new Date('2026-11-05T08:00:00.000Z'),
    updatedAt: new Date('2026-11-05T08:00:00.000Z'),
  },
};
