import manifest from './topic-content-v2.json' with { type: 'json' };

export function prepareTopicContentV2() {
  const revisions = new Set(
    Object.keys(manifest.metadata.revisionMigrationBySeedKey),
  );
  /** @param {string} kind */
  const recordsFor = (kind) =>
    manifest.entries
      .filter((entry) => entry.kind === kind)
      .map(({ seedKey, contentId, versionId, payload }) => ({
        ...payload,
        contentId,
        versionId,
        revision: revisions.has(seedKey) ? 2 : 1,
      }));

  return {
    knowledges: recordsFor('knowledge'),
    questions: recordsFor('question'),
    scenarios: recordsFor('scenario'),
    decks: recordsFor('deck'),
  };
}

/**
 * @param {{
 *   reviewStatus: string,
 *   entries: Array<{ kind: string, seedKey: string, versionId: string }>,
 *   metadata: {
 *     scenarioReviewBySeedKey: Record<string, {
 *       scenarioVersionId: string, reviewStatus: string, humanReviewer: string | null
 *     }>
 *   }
 * }} [source]
 */
export function assertTopicContentV2Reviewed(source = manifest) {
  const reviews = new Map(
    Object.entries(source.metadata.scenarioReviewBySeedKey),
  );
  const scenarios = source.entries.filter(({ kind }) => kind === 'scenario');
  const pending = scenarios.filter(({ seedKey, versionId }) => {
    const review = reviews.get(seedKey);
    return (
      review?.scenarioVersionId !== versionId ||
      review.reviewStatus !== 'approved' ||
      !review.humanReviewer?.trim()
    );
  });
  if (source.reviewStatus !== 'approved' || pending.length > 0) {
    throw new Error(
      `Bộ học liệu v2 chưa có duyệt độc lập đầy đủ (${pending.length}/${scenarios.length} tình huống chưa duyệt).`,
    );
  }
}
