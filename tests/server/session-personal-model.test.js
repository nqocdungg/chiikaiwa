import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { SessionPersonal } from '../../server/modules/learning/session-personal-model.js';

const ownerKey = `user:${new Types.ObjectId()}`;
const sessionId = new Types.ObjectId();

describe('session personal schema', () => {
  it('applies independent zero versions and omits optional private fields', async () => {
    const document = new SessionPersonal({ ownerKey, sessionId });
    await document.validate();
    expect(document.noteVersion).toBe(0);
    expect(document.version).toBe(0);
    expect(document.toObject()).not.toHaveProperty('note');
    expect(document.toObject()).not.toHaveProperty('selfAssessment');
    expect(document.toObject()).not.toHaveProperty('purgeAt');
  });

  it.each([
    { ownerKey: '' },
    { ownerKey: 'admin:123' },
    { sessionId: 'invalid-id' },
    { note: 'n'.repeat(10_001) },
    { noteVersion: -1 },
    { noteVersion: 0.5 },
    { version: -1 },
    { version: 0.5 },
    { selfAssessment: { confidence: 0 } },
    { selfAssessment: { confidence: 6 } },
    { selfAssessment: { confidence: 1.5 } },
    { selfAssessment: { confidence: 3, comment: 'c'.repeat(1_001) } },
    { purgeAt: null },
  ])('rejects invalid personal data: %j', async (fields) => {
    await expect(
      new SessionPersonal({ ownerKey, sessionId, ...fields }).validate(),
    ).rejects.toThrow();
  });

  it('rejects fields outside the private-session contract', () => {
    expect(
      () => new SessionPersonal({ ownerKey, sessionId, publicNote: 'leak' }),
    ).toThrow();
  });
});
