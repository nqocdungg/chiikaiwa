import { describe, it, expect } from 'vitest';
import {
  validateSeedDataset,
  isValidObjectId,
} from '../../server/modules/content/content-validator.js';
import { n3Dataset } from '../../server/persistence/seed/n3-content.js';
import { sampleDataset } from '../../server/persistence/seed/sample-content.js';
import { n1Dataset } from '../../server/persistence/seed/n1-content.js';

describe('DATA-003: N3 Learning Material Seed Dataset (PB-31)', () => {
  it('passes validateSeedDataset with 0 errors', () => {
    const result = validateSeedDataset(n3Dataset);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('meets PB-31 and DATA-003 minimum counts for N3 scenarios, quizzes, knowledges, and deck', () => {
    expect(n3Dataset.scenarios.length).toBeGreaterThanOrEqual(5);
    expect(n3Dataset.questions.length).toBeGreaterThanOrEqual(15);
    expect(n3Dataset.knowledges.length).toBeGreaterThanOrEqual(1);
    expect(n3Dataset.decks.length).toBeGreaterThanOrEqual(1);

    const n3Deck = n3Dataset.decks.find((deck) => deck.level === 'N3');
    expect(n3Deck).toBeDefined();
    expect(n3Deck?.scenarioVersionIds.length).toBeGreaterThanOrEqual(5);
    expect(n3Deck?.questionVersionIds.length).toBeGreaterThanOrEqual(15);

    for (const scenario of n3Dataset.scenarios) {
      expect(scenario.questionVersionIds.length).toBeGreaterThanOrEqual(3);
      expect(scenario.knowledgeVersionIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('enforces distinct roles and required reading/meaning/examples beyond baseline validator checks', () => {
    for (const scenario of n3Dataset.scenarios) {
      expect(scenario.roleA.trim()).not.toBe('');
      expect(scenario.roleB.trim()).not.toBe('');
      expect(scenario.roleA.trim()).not.toBe(scenario.roleB.trim());
    }

    for (const knowledge of n3Dataset.knowledges) {
      expect(typeof knowledge.reading).toBe('string');
      expect(knowledge.reading.trim()).not.toBe('');
      expect(knowledge.meaning.trim()).not.toBe('');
      expect(knowledge.examples.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('ensures quiz options and acceptedAnswers have no duplicate text and link to knowledge items', () => {
    for (const question of n3Dataset.questions) {
      expect(Array.isArray(question.knowledgeVersionIds)).toBe(true);
      expect(question.knowledgeVersionIds.length).toBeGreaterThanOrEqual(1);

      if (question.type === 'multipleChoice') {
        const options = question.options ?? [];
        const optionTexts = options.map((opt) => opt.text.trim());
        expect(new Set(optionTexts).size).toBe(optionTexts.length);
      } else if (question.type === 'shortAnswer') {
        const acceptedAnswers = question.acceptedAnswers ?? [];
        const normalizedAnswers = acceptedAnswers.map((ans) => ans.trim());
        expect(new Set(normalizedAnswers).size).toBe(normalizedAnswers.length);
      }
    }
  });

  it('distributes multiple-choice correct answers across multiple option array positions', () => {
    const mcQuestions = n3Dataset.questions.filter(
      (question) => question.type === 'multipleChoice',
    );
    expect(mcQuestions.length).toBeGreaterThan(1);

    /** @type {Map<number, number>} */
    const positionCounts = new Map();
    for (const question of mcQuestions) {
      const options = question.options ?? [];
      const index = options.findIndex(
        (opt) => opt.id === question.correctOptionId,
      );
      expect(index).toBeGreaterThanOrEqual(0);
      positionCounts.set(index, (positionCounts.get(index) ?? 0) + 1);
    }

    expect(positionCounts.size).toBeGreaterThan(1);
    const maxPositionCount = Math.max(...positionCounts.values());
    expect(maxPositionCount).toBeLessThanOrEqual(
      Math.ceil(mcQuestions.length / 2),
    );
  });

  it('has no orphan scenarios, questions, or knowledges unreferenced by scenarios or deck manifest', () => {
    const deck = n3Dataset.decks[0];
    const deckScenarioSet = new Set(deck.scenarioVersionIds);
    const deckKnowledgeSet = new Set(deck.knowledgeVersionIds);
    const deckQuestionSet = new Set(deck.questionVersionIds);

    const scenarioReferencedKnowledges = new Set();
    const scenarioReferencedQuestions = new Set();

    for (const scenario of n3Dataset.scenarios) {
      expect(deckScenarioSet.has(scenario.versionId)).toBe(true);
      for (const kvId of scenario.knowledgeVersionIds) {
        scenarioReferencedKnowledges.add(kvId);
      }
      for (const qvId of scenario.questionVersionIds) {
        scenarioReferencedQuestions.add(qvId);
      }
    }

    for (const knowledge of n3Dataset.knowledges) {
      expect(deckKnowledgeSet.has(knowledge.versionId)).toBe(true);
      expect(scenarioReferencedKnowledges.has(knowledge.versionId)).toBe(true);
    }

    for (const question of n3Dataset.questions) {
      expect(deckQuestionSet.has(question.versionId)).toBe(true);
      expect(scenarioReferencedQuestions.has(question.versionId)).toBe(true);
    }
  });

  it('does not collide on contentId, versionId, or topicKey with existing seed datasets', () => {
    const existingIds = new Set();
    const existingTopicKeys = new Set();

    for (const dataset of [sampleDataset, n1Dataset]) {
      for (const group of [
        dataset.knowledges,
        dataset.questions,
        dataset.scenarios,
        dataset.decks,
      ]) {
        for (const item of group) {
          existingIds.add(item.contentId);
          existingIds.add(item.versionId);
        }
      }
      for (const deck of dataset.decks) {
        existingTopicKeys.add(deck.topicKey);
      }
    }

    for (const group of [
      n3Dataset.knowledges,
      n3Dataset.questions,
      n3Dataset.scenarios,
      n3Dataset.decks,
    ]) {
      for (const item of group) {
        expect(isValidObjectId(item.contentId)).toBe(true);
        expect(isValidObjectId(item.versionId)).toBe(true);
        expect(existingIds.has(item.contentId)).toBe(false);
        expect(existingIds.has(item.versionId)).toBe(false);
      }
    }

    for (const deck of n3Dataset.decks) {
      expect(existingTopicKeys.has(deck.topicKey)).toBe(false);
    }
  });
});
