import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { processLivekitWebhook } from '../../server/modules/sessions/livekit-webhook-service.js';
import {
  LIVEKIT_TEST_KEY,
  LIVEKIT_TEST_SECRET,
  makeWebhook,
  signWebhookBody,
  WEBHOOK_ACTORS,
  WEBHOOK_NOW,
  WEBHOOK_ROOM,
} from '../fixtures/livekit-fixtures.js';

/** @typedef {import('../../server/modules/sessions/livekit-webhook-service.js').PresenceConsumer} PresenceConsumer */
/** @type {MongoMemoryReplSet} */ let replica;
/** @type {import('mongoose').mongo.Db} */ let db;
const sessionId = new mongoose.Types.ObjectId('907f1f77bcf86cd799439011');
let consumer = vi.fn(/** @type {PresenceConsumer} */ (async () => {}));
let readParticipant = vi.fn(
  /** @type {typeof import('../../server/integrations/livekit/room-service.js').readMediaParticipant} */ (
    async () => null
  ),
);
const seconds = WEBHOOK_NOW.getTime() / 1000 - 10;

/** @param {ReturnType<typeof makeWebhook>} event */
function process(event) {
  return processLivekitWebhook(event, {
    now: () => WEBHOOK_NOW,
    onVerifiedPresence: consumer,
    readParticipant,
  });
}
function readSession() {
  return db.collection('practice_sessions').findOne({ _id: sessionId });
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replica.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_webhook_test');
  vi.stubEnv('LIVEKIT_URL', 'wss://webhook.example.test');
  vi.stubEnv('LIVEKIT_API_KEY', LIVEKIT_TEST_KEY);
  vi.stubEnv('LIVEKIT_API_SECRET', LIVEKIT_TEST_SECRET);
  db = await connectDatabase();
  await up(db);
});
beforeEach(async () => {
  await db.collection('practice_sessions').deleteMany({});
  await db.collection('webhook_receipts').deleteMany({});
  await db.collection('statistics').deleteMany({});
  consumer = vi.fn(/** @type {PresenceConsumer} */ (async () => {}));
  readParticipant = vi.fn(
    /** @type {typeof import('../../server/integrations/livekit/room-service.js').readMediaParticipant} */ (
      async () => null
    ),
  );
  await db.collection('practice_sessions').insertOne({
    _id: sessionId,
    originKind: 'invite',
    originId: new mongoose.Types.ObjectId(),
    roomName: WEBHOOK_ROOM,
    members: WEBHOOK_ACTORS.map((actorKey) => ({ actorKey, kind: 'user' })),
    presence: WEBHOOK_ACTORS.map((actorKey) => ({
      actorKey,
      connected: false,
    })),
    status: 'preparing',
    version: 0,
    createdAt: new Date(WEBHOOK_NOW.getTime() - 60_000),
    activeDurationMs: 0,
    selectionRemainingMs: 60_000,
  });
});
afterAll(async () => {
  await disconnectDatabase();
  await replica?.stop();
  vi.unstubAllEnvs();
});

describe('BE-011 atomic webhook receipt and presence', () => {
  it('updates only verified presence and retains minimal receipts for seven days', async () => {
    const event = makeWebhook();
    await process(event);
    const session = await readSession();
    expect(session?.presence[0]).toMatchObject({
      connected: true,
      connectionSid: 'PA_0',
      lastEventAt: new Date(seconds * 1000),
    });
    expect(session?.presence[1].connected).toBe(false);
    expect(session).toMatchObject({
      status: 'preparing',
      version: 1,
      activeDurationMs: 0,
    });
    expect(session).not.toHaveProperty('startedAt');
    const receipt = await db
      .collection('webhook_receipts')
      .findOne({ eventId: event.id });
    expect(receipt).toEqual({
      _id: expect.any(mongoose.Types.ObjectId),
      eventId: event.id,
      eventType: 'participant_joined',
      roomName: WEBHOOK_ROOM,
      connectionSid: 'PA_0',
      occurredAt: new Date(seconds * 1000),
      processedAt: WEBHOOK_NOW,
      purgeAt: new Date(WEBHOOK_NOW.getTime() + 7 * 86400_000),
    });
    expect(consumer).toHaveBeenCalledWith(
      expect.objectContaining({
        presenceChanged: true,
        reason: 'presence.updated',
      }),
    );
  });

  it('deduplicates sequential and concurrent deliveries using the migrated unique eventId index', async () => {
    const event = makeWebhook();
    await Promise.all([process(event), process(event), process(event)]);
    await process(event);
    expect(await db.collection('webhook_receipts').countDocuments()).toBe(1);
    expect((await readSession())?.version).toBe(1);
    expect(consumer).toHaveBeenCalledTimes(1);
  });

  it('serializes two joins and permits a transactional lifecycle consumer to start once', async () => {
    // Consumer fixture exercises the BE-012 boundary; production lifecycle is a separate task.
    consumer = vi.fn(
      async ({ after, presenceChanged, session, observedAt }) => {
        if (
          presenceChanged &&
          !after.startedAt &&
          after.presence.every(
            (/** @type {Record<string, any>} */ item) => item.connected,
          )
        ) {
          await db.collection('practice_sessions').updateOne(
            { _id: after._id, version: after.version },
            {
              $set: { status: 'active', startedAt: observedAt },
              $inc: { testStartCount: 1 },
            },
            { session },
          );
        }
      },
    );
    const events = [makeWebhook(), makeWebhook({ actor: 1 })];
    await Promise.all(events.map(process));
    await Promise.all(events.map(process));
    const session = await readSession();
    expect(
      session?.presence.every(
        (/** @type {Record<string, any>} */ item) => item.connected,
      ),
    ).toBe(true);
    expect(session).toMatchObject({
      status: 'active',
      startedAt: WEBHOOK_NOW,
      testStartCount: 1,
      version: 2,
    });
    expect(await db.collection('webhook_receipts').countDocuments()).toBe(2);
  });

  it('rolls back the receipt, presence and consumer writes on failure, then retries', async () => {
    const event = makeWebhook();
    consumer.mockImplementation(async ({ session }) => {
      await db.collection('statistics').insertOne({ test: true }, { session });
      throw new Error('lifecycle failed');
    });
    await expect(process(event)).rejects.toThrow('lifecycle failed');
    expect((await readSession())?.version).toBe(0);
    expect(await db.collection('webhook_receipts').countDocuments()).toBe(0);
    expect(await db.collection('statistics').countDocuments()).toBe(0);
    consumer.mockImplementation(async () => {});
    await process(event);
    expect((await readSession())?.presence[0].connected).toBe(true);
  });

  it('fails closed when the lifecycle consumer is missing, leaving the event retryable', async () => {
    const event = makeWebhook();
    await expect(
      processLivekitWebhook(event, { now: () => WEBHOOK_NOW }),
    ).rejects.toThrow('Lifecycle consumer');
    expect((await readSession())?.version).toBe(0);
    expect(await db.collection('webhook_receipts').countDocuments()).toBe(0);
    await process(event);
    expect((await readSession())?.version).toBe(1);
  });

  it('does not infer presence or start from room_started or unrelated track events', async () => {
    await process(makeWebhook({ type: 'room_started' }));
    await process(makeWebhook({ type: 'track_published' }));
    expect((await readSession())?.version).toBe(0);
    expect(consumer).not.toHaveBeenCalled();
  });

  it('ignores unknown rooms and nonmembers without touching session data', async () => {
    const room = makeWebhook();
    room.room.name = 'other-room';
    const outsider = makeWebhook();
    outsider.participant.identity = 'user:outsider';
    await process(room);
    await process(outsider);
    expect((await readSession())?.version).toBe(0);
    expect(consumer).not.toHaveBeenCalled();
  });

  it('keeps a closed SID closed even after receipt deletion and same-second join replay', async () => {
    const join = makeWebhook();
    await process(join);
    await process(makeWebhook({ type: 'participant_left' }));
    await db.collection('webhook_receipts').deleteMany({});
    await process(join);
    const session = await readSession();
    expect(session?.presence[0]).toMatchObject({
      connected: false,
      connectionSid: 'PA_0',
      disconnectedAt: WEBHOOK_NOW,
      reconnectUntil: new Date(WEBHOOK_NOW.getTime() + 300_000),
    });
    expect(session?.version).toBe(2);
  });

  it('does not extend the reconnect deadline on repeated disconnects', async () => {
    await process(makeWebhook({ type: 'participant_connection_aborted' }));
    const later = new Date(WEBHOOK_NOW.getTime() + 60_000);
    await processLivekitWebhook(
      makeWebhook({ type: 'participant_left', seconds: seconds + 1 }),
      { now: () => later, onVerifiedPresence: consumer },
    );
    expect((await readSession())?.presence[0].reconnectUntil).toEqual(
      new Date(WEBHOOK_NOW.getTime() + 300_000),
    );
  });

  it('reconciles a new SID at equal timestamps, ignores older leave and old SID replay', async () => {
    const old = makeWebhook();
    await process(old);
    readParticipant.mockResolvedValue('PA_new');
    await process(makeWebhook({ sid: 'PA_new' }));
    await process(
      makeWebhook({ type: 'participant_left', seconds: seconds - 1 }),
    );
    await db.collection('webhook_receipts').deleteMany({});
    await process(old);
    expect((await readSession())?.presence[0]).toMatchObject({
      connected: true,
      connectionSid: 'PA_new',
    });
    expect(readParticipant).toHaveBeenCalledWith(
      WEBHOOK_ROOM,
      WEBHOOK_ACTORS[0],
    );
  });

  it('reconciles a newer mismatched leave when its join webhook was lost', async () => {
    await process(makeWebhook());
    readParticipant.mockResolvedValue(null);
    await process(
      makeWebhook({
        type: 'participant_left',
        sid: 'PA_missed_join',
        seconds: seconds + 1,
      }),
    );
    expect((await readSession())?.presence[0]).toMatchObject({
      connected: false,
      connectionSid: 'PA_missed_join',
    });
    expect(consumer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reason: 'presence.reconciled',
        presenceChanged: true,
      }),
    );
  });

  it('keeps the active new connection when an old leave arrives at the same second', async () => {
    await process(makeWebhook());
    readParticipant.mockResolvedValue('PA_new');
    await process(makeWebhook({ sid: 'PA_new' }));
    await process(makeWebhook({ type: 'participant_left' }));
    expect((await readSession())?.presence[0]).toMatchObject({
      connected: true,
      connectionSid: 'PA_new',
    });
  });

  it('propagates reconciliation failure without acknowledging or changing presence', async () => {
    await process(makeWebhook());
    const event = makeWebhook({ sid: 'PA_new', seconds: seconds + 1 });
    readParticipant.mockRejectedValue(new Error('LiveKit unavailable'));
    await expect(process(event)).rejects.toThrow('LiveKit unavailable');
    expect(
      await db.collection('webhook_receipts').findOne({ eventId: event.id }),
    ).toBeNull();
    expect((await readSession())?.presence[0].connectionSid).toBe('PA_0');
  });

  it('rechecks the database snapshot after reconciliation races another webhook', async () => {
    await process(makeWebhook());
    readParticipant.mockImplementationOnce(async () => {
      await process(
        makeWebhook({ type: 'participant_left', seconds: seconds + 2 }),
      );
      return 'PA_new';
    });
    await process(makeWebhook({ sid: 'PA_new', seconds: seconds + 1 }));
    expect((await readSession())?.presence[0]).toMatchObject({
      connected: false,
      connectionSid: 'PA_0',
    });
    expect((await readSession())?.version).toBe(2);
  });

  it.each(['ended', 'preparing expired', 'reconnect expired'])(
    'forwards %s joins for lifecycle handling without marking presence connected',
    async (state) => {
      const changes =
        state === 'ended'
          ? { status: 'ended' }
          : state === 'preparing expired'
            ? { createdAt: new Date(WEBHOOK_NOW.getTime() - 300_000) }
            : { 'presence.0.reconnectUntil': WEBHOOK_NOW };
      await db
        .collection('practice_sessions')
        .updateOne({ _id: sessionId }, { $set: changes });
      await process(makeWebhook());
      expect((await readSession())?.presence[0].connected).toBe(false);
      expect(consumer).toHaveBeenCalledWith(
        expect.objectContaining({
          presenceChanged: false,
          reason: state === 'ended' ? 'session.ended' : 'deadline.expired',
        }),
      );
    },
  );

  it('forwards room_finished without guessing participant presence from a room event', async () => {
    await process(makeWebhook({ type: 'room_finished' }));
    expect(consumer).toHaveBeenCalledWith(
      expect.objectContaining({
        presenceChanged: false,
        reason: 'room.finished',
      }),
    );
    expect((await readSession())?.version).toBe(0);
  });

  it('rejects invalid signed event envelopes before storing a receipt', async () => {
    const noSid = makeWebhook();
    noSid.participant.sid = '';
    const future = makeWebhook({ seconds: WEBHOOK_NOW.getTime() / 1000 + 1 });
    const noId = makeWebhook({ id: '' });
    for (const event of [noSid, future, noId])
      await expect(process(event)).rejects.toThrow();
    expect(await db.collection('webhook_receipts').countDocuments()).toBe(0);
  });

  it('wires the default Express handler to verification, database and transactional consumer', async () => {
    // Use current timestamps for the real default wiring (no mocked verifier/service).
    const date = new Date();
    await db
      .collection('practice_sessions')
      .updateOne({ _id: sessionId }, { $set: { createdAt: date } });
    const event = makeWebhook({ seconds: Math.floor(date.getTime() / 1000) });
    const body = event.toJsonString();
    const app = createApp({ onVerifiedPresence: consumer });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Content-Type', 'application/webhook+json')
        .set('Authorization', await signWebhookBody(body))
        .send(body)
        .expect(204);
    }
    expect(consumer).toHaveBeenCalledTimes(1);
    expect((await readSession())?.presence[0].connected).toBe(true);
  });
});
