import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  SavedItem,
  SavedSource,
} from '../../server/modules/learning/saved-item-models.js';

const ownerKey = `user:${new Types.ObjectId()}`;
const knowledgeId = new Types.ObjectId();
const source = {
  ownerKey,
  knowledgeId,
  savedItemId: new Types.ObjectId(),
  knowledgeVersionId: new Types.ObjectId(),
  deckVersionId: new Types.ObjectId(),
};

describe('saved knowledge schemas', () => {
  it('omits absent references and derives the deck context', async () => {
    const document = new SavedSource(source);
    await document.validate();
    expect(document.contextKey).toBe(
      `deck:${source.deckVersionId}:${source.knowledgeVersionId}`,
    );
    expect(document.toObject()).not.toHaveProperty('sessionId');
    expect(document.toObject()).not.toHaveProperty('scenarioVersionId');
  });

  it.each([
    { sessionId: null },
    { scenarioVersionId: null },
    { sessionId: null, scenarioVersionId: null },
    { sessionId: new Types.ObjectId() },
    { scenarioVersionId: new Types.ObjectId() },
    { contextKey: 'client-supplied' },
    { knowledgeVersionId: 'invalid-id' },
  ])('rejects invalid source fields: %j', async (fields) => {
    await expect(
      new SavedSource({ ...source, ...fields }).validate(),
    ).rejects.toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity])(
    'rejects invalid version %s',
    async (version) => {
      await expect(
        new SavedItem({
          ownerKey,
          knowledgeId,
          savedAt: new Date(),
          version,
        }).validate(),
      ).rejects.toThrow();
    },
  );

  it.each(['', 'admin:123', 'user:not-an-objectid'])(
    'rejects invalid owner %s',
    async (invalidOwner) => {
      await expect(
        new SavedItem({
          ownerKey: invalidOwner,
          knowledgeId,
          savedAt: new Date(),
        }).validate(),
      ).rejects.toThrow();
    },
  );
});
