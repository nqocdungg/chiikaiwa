import { isDeepStrictEqual } from 'node:util';

/** @typedef {{collection: string, key: Record<string, 1 | -1>, options: {name: string, unique?: boolean, expireAfterSeconds?: number}}} IndexDefinition */

/** @type {IndexDefinition[]} */
export const databaseIndexes = [
  {
    collection: 'users',
    key: { emailKey: 1 },
    options: { name: 'emailKey_unique', unique: true },
  },
  {
    collection: 'auth_sessions',
    key: { userId: 1, expiresAt: 1 },
    options: { name: 'user_expiry' },
  },
  {
    collection: 'password_reset_tokens',
    key: { tokenHash: 1 },
    options: { name: 'tokenHash_unique', unique: true },
  },
  {
    collection: 'password_reset_tokens',
    key: { userId: 1, expiresAt: 1 },
    options: { name: 'user_expiry' },
  },
  {
    collection: 'guest_sessions',
    key: { credentialHash: 1 },
    options: { name: 'credentialHash_unique', unique: true },
  },
  {
    collection: 'guest_sessions',
    key: { status: 1, expiresAt: 1 },
    options: { name: 'status_expiry' },
  },
  {
    collection: 'actor_states',
    key: { mode: 1, 'search.level': 1, 'search.queuedAt': 1 },
    options: { name: 'mode_search_level_queuedAt' },
  },
  {
    collection: 'match_proposals',
    key: { status: 1, expiresAt: 1 },
    options: { name: 'status_expiry' },
  },
  {
    collection: 'invitations',
    key: { code: 1 },
    options: { name: 'code_unique', unique: true },
  },
  {
    collection: 'invitations',
    key: { status: 1, expiresAt: 1 },
    options: { name: 'status_expiry' },
  },
  {
    collection: 'invite_requests',
    key: { invitationId: 1, requesterKey: 1 },
    options: { name: 'invitation_requester_unique', unique: true },
  },
  {
    collection: 'invite_requests',
    key: { invitationId: 1, status: 1 },
    options: { name: 'invitation_status' },
  },
  {
    collection: 'practice_sessions',
    key: { originKind: 1, originId: 1 },
    options: { name: 'origin_unique', unique: true },
  },
  {
    collection: 'practice_sessions',
    key: { roomName: 1 },
    options: { name: 'roomName_unique', unique: true },
  },
  {
    collection: 'practice_sessions',
    key: { 'members.actorKey': 1, startedAt: -1, _id: -1 },
    options: { name: 'member_history' },
  },
  {
    collection: 'practice_sessions',
    key: { status: 1, 'presence.reconnectUntil': 1 },
    options: { name: 'status_reconnect' },
  },
  {
    collection: 'practice_sessions',
    key: { 'mediaCleanup.state': 1, updatedAt: 1 },
    options: { name: 'mediaCleanup_updatedAt' },
  },
  {
    collection: 'session_cards',
    key: { sessionId: 1, slot: 1 },
    options: { name: 'session_slot_unique', unique: true },
  },
  {
    collection: 'session_cards',
    key: { sessionId: 1, scenarioVersionId: 1 },
    options: { name: 'session_scenario_unique', unique: true },
  },
  {
    collection: 'session_personal',
    key: { ownerKey: 1, sessionId: 1 },
    options: { name: 'owner_session_unique', unique: true },
  },
  {
    collection: 'content_items',
    key: { kind: 1, status: 1, level: 1, _id: 1 },
    options: { name: 'kind_status_level_id' },
  },
  {
    collection: 'content_versions',
    key: { contentId: 1, revision: 1 },
    options: { name: 'content_revision_unique', unique: true },
  },
  {
    collection: 'saved_items',
    key: { ownerKey: 1, knowledgeId: 1 },
    options: { name: 'owner_knowledge_unique', unique: true },
  },
  {
    collection: 'saved_items',
    key: { ownerKey: 1, isSaved: 1, savedAt: -1, _id: -1 },
    options: { name: 'owner_savedAt' },
  },
  {
    collection: 'saved_sources',
    key: { ownerKey: 1, knowledgeId: 1, contextKey: 1 },
    options: { name: 'owner_knowledge_context_unique', unique: true },
  },
  {
    collection: 'saved_sources',
    key: { ownerKey: 1, sessionId: 1 },
    options: { name: 'owner_session' },
  },
  {
    collection: 'personal_decks',
    key: { ownerKey: 1, status: 1, createdAt: -1, _id: -1 },
    options: { name: 'owner_status_createdAt' },
  },
  {
    collection: 'deck_entries',
    key: { deckId: 1, cardKey: 1 },
    options: { name: 'deck_card_unique', unique: true },
  },
  {
    collection: 'deck_entries',
    key: { ownerKey: 1, cardKey: 1 },
    options: { name: 'owner_card' },
  },
  {
    collection: 'manual_cards',
    key: { ownerKey: 1, status: 1, _id: 1 },
    options: { name: 'owner_status_id' },
  },
  {
    collection: 'card_progress',
    key: { ownerKey: 1, cardKey: 1 },
    options: { name: 'owner_card_unique', unique: true },
  },
  {
    collection: 'card_progress',
    key: { ownerKey: 1, dueAt: 1, _id: 1 },
    options: { name: 'owner_dueAt_id' },
  },
  {
    collection: 'review_logs',
    key: { ownerKey: 1, operationId: 1 },
    options: { name: 'owner_operation_unique', unique: true },
  },
  {
    collection: 'review_logs',
    key: { ownerKey: 1, cardKey: 1, reviewedAt: -1, _id: -1 },
    options: { name: 'owner_card_reviewedAt' },
  },
  {
    collection: 'quiz_attempts',
    key: { ownerKey: 1, createdAt: -1, _id: -1 },
    options: { name: 'owner_createdAt_id' },
  },
  {
    collection: 'quiz_attempts',
    key: { ownerKey: 1, sourceSessionId: 1 },
    options: { name: 'owner_sourceSession' },
  },
  {
    collection: 'blocks',
    key: { blockerKey: 1, blockedKey: 1 },
    options: { name: 'blocker_blocked_unique', unique: true },
  },
  {
    collection: 'reports',
    key: { status: 1, createdAt: -1, _id: -1 },
    options: { name: 'status_createdAt_id' },
  },
  {
    collection: 'reports',
    key: { sessionId: 1 },
    options: { name: 'session' },
  },
  {
    collection: 'operation_receipts',
    key: { actorKey: 1, action: 1, resourceKey: 1, operationId: 1 },
    options: { name: 'actor_action_resource_operation_unique', unique: true },
  },
  {
    collection: 'webhook_receipts',
    key: { eventId: 1 },
    options: { name: 'eventId_unique', unique: true },
  },
  {
    collection: 'auth_sessions',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'password_reset_tokens',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'operation_receipts',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'webhook_receipts',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'rate_limits',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'session_personal',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'saved_items',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'saved_sources',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'personal_decks',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'deck_entries',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'manual_cards',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'card_progress',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'review_logs',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: 'quiz_attempts',
    key: { purgeAt: 1 },
    options: { name: 'purgeAt_ttl', expireAfterSeconds: 0 },
  },
];

const indexMetadataFields = new Set(['key', 'name', 'ns', 'v', 'background']);

/** @param {import('mongoose').mongo.Db} db @param {string} name */
async function ensureCollection(db, name) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing[0]) {
    if (existing[0].type !== 'collection') {
      throw new Error(`Cannot apply indexes: ${name} is not a collection`);
    }
    return;
  }
  await db.createCollection(name);
}

/** @param {Record<string, unknown>} options */
function comparableOptions(options) {
  const comparable = Object.fromEntries(
    Object.entries(options).filter(
      ([field]) => !indexMetadataFields.has(field),
    ),
  );
  for (const field of ['unique', 'sparse', 'hidden']) {
    comparable[field] = Boolean(options[field]);
  }
  for (const field of [
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation',
  ]) {
    comparable[field] ??= null;
  }
  return comparable;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function sameIndexKey(left, right) {
  const leftFields = Object.entries(left);
  const rightFields = Object.entries(right);
  return (
    leftFields.length === rightFields.length &&
    leftFields.every(([field, direction], index) => {
      const rightField = rightFields[index];
      return (
        rightField !== undefined &&
        field === rightField[0] &&
        isDeepStrictEqual(direction, rightField[1])
      );
    })
  );
}

/** @param {import('mongoose').mongo.Db} db @param {IndexDefinition} definition */
async function ensureIndex(db, definition) {
  const collection = db.collection(definition.collection);
  const indexes = await collection.listIndexes().toArray();
  const sameName = indexes.find(
    (index) => index.name === definition.options.name,
  );
  const sameKey = indexes.find((index) =>
    sameIndexKey(index.key, definition.key),
  );
  const existing = sameName ?? sameKey;

  if (existing) {
    if (
      !sameIndexKey(existing.key, definition.key) ||
      !isDeepStrictEqual(
        comparableOptions(existing),
        comparableOptions(definition.options),
      )
    ) {
      throw new Error(
        `Conflicting index definition on ${definition.collection}.${definition.options.name}`,
      );
    }
    return;
  }

  await collection.createIndex(definition.key, definition.options);
}

/** @param {import('mongoose').mongo.Db} db */
export async function up(db) {
  const collections = [
    ...new Set(databaseIndexes.map(({ collection }) => collection)),
  ];
  for (const name of collections) await ensureCollection(db, name);
  for (const definition of databaseIndexes) await ensureIndex(db, definition);
}
