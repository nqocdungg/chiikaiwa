import { describe, it, expect } from 'vitest';
import {
  validateSeedDataset,
  isValidObjectId,
} from '../../server/modules/content/content-validator.js';
import { n1Dataset } from '../../server/persistence/seed/n1-content.js';

describe('DATA-005: N1 Learning Material Seed Dataset (PB-31)', () => {
  describe('Schema & Contract Validation (Database Design §7.1, §7.2, PB-31)', () => {
    it('n1Dataset passes complete schema validation with 0 errors (validateSeedDataset)', () => {
      const result = validateSeedDataset(n1Dataset);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('contains at least 5 complete N1 scenarios (PB-31 AC 1, 01 §5.1)', () => {
      expect(n1Dataset.scenarios.length).toBeGreaterThanOrEqual(5);

      for (const scenario of n1Dataset.scenarios) {
        expect(isValidObjectId(scenario.contentId)).toBe(true);
        expect(isValidObjectId(scenario.versionId)).toBe(true);
        expect(scenario.revision).toBe(1);

        // Required text fields
        expect(scenario.title.trim()).not.toBe('');
        expect(scenario.context.trim()).not.toBe('');
        expect(scenario.objective.trim()).not.toBe('');
        expect(scenario.roleA.trim()).not.toBe('');
        expect(scenario.roleB.trim()).not.toBe('');
        expect(scenario.roleA).not.toEqual(scenario.roleB);

        // Hints
        expect(Array.isArray(scenario.hints)).toBe(true);
        expect(scenario.hints.length).toBeGreaterThanOrEqual(1);
        for (const hint of scenario.hints) {
          expect(typeof hint).toBe('string');
          expect(hint.trim()).not.toBe('');
        }

        // Minimum 3 quiz questions per scenario (PB-31 AC 1, FR-ADM-03)
        expect(Array.isArray(scenario.questionVersionIds)).toBe(true);
        expect(scenario.questionVersionIds.length).toBeGreaterThanOrEqual(3);

        // Associated knowledge references
        expect(Array.isArray(scenario.knowledgeVersionIds)).toBe(true);
        expect(scenario.knowledgeVersionIds.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('contains at least 15 valid N1 quiz questions with answers and explanations (PB-31 AC 1, AC 2)', () => {
      expect(n1Dataset.questions.length).toBeGreaterThanOrEqual(15);

      const validQuestionTypes = ['multipleChoice', 'shortAnswer'];

      for (const question of n1Dataset.questions) {
        expect(isValidObjectId(question.contentId)).toBe(true);
        expect(isValidObjectId(question.versionId)).toBe(true);
        expect(question.revision).toBe(1);
        expect(validQuestionTypes).toContain(question.type);

        expect(question.prompt.trim()).not.toBe('');
        expect(question.explanation.trim()).not.toBe('');

        if (question.type === 'multipleChoice') {
          expect(Array.isArray(question.options)).toBe(true);
          const options = question.options ?? [];
          expect(options.length).toBeGreaterThanOrEqual(2);
          const optionIds = options.map((opt) => opt.id);
          expect(optionIds).toContain(question.correctOptionId);
        } else if (question.type === 'shortAnswer') {
          expect(Array.isArray(question.acceptedAnswers)).toBe(true);
          const acceptedAnswers = question.acceptedAnswers ?? [];
          expect(acceptedAnswers.length).toBeGreaterThanOrEqual(1);
          for (const ans of acceptedAnswers) {
            expect(typeof ans).toBe('string');
            expect(ans.trim()).not.toBe('');
          }
        }
      }
    });

    it('contains at least 10 N1 knowledge items with meanings and bilingual examples (PB-31 AC 2)', () => {
      expect(n1Dataset.knowledges.length).toBeGreaterThanOrEqual(10);

      const validTypes = ['vocabulary', 'grammar'];

      for (const k of n1Dataset.knowledges) {
        expect(isValidObjectId(k.contentId)).toBe(true);
        expect(isValidObjectId(k.versionId)).toBe(true);
        expect(k.revision).toBe(1);
        expect(validTypes).toContain(k.type);

        expect(k.expression.trim()).not.toBe('');
        expect(k.meaning.trim()).not.toBe('');

        expect(Array.isArray(k.examples)).toBe(true);
        expect(k.examples.length).toBeGreaterThanOrEqual(1);
        for (const ex of k.examples) {
          expect(ex.japanese.trim()).not.toBe('');
          expect(ex.vietnamese.trim()).not.toBe('');
        }
      }
    });

    it('contains an N1 topic deck that consolidates all scenarios and references (Database Design §7.2)', () => {
      expect(n1Dataset.decks.length).toBeGreaterThanOrEqual(1);
      const deck = n1Dataset.decks[0];

      expect(isValidObjectId(deck.contentId)).toBe(true);
      expect(isValidObjectId(deck.versionId)).toBe(true);
      expect(deck.revision).toBe(1);
      expect(deck.level).toBe('N1');
      expect(deck.topicKey).toBe('business_negotiation_n1');
      expect(deck.title.trim()).not.toBe('');
      expect(deck.description.trim()).not.toBe('');

      expect(deck.scenarioVersionIds.length).toBe(5);
      expect(deck.knowledgeVersionIds.length).toBe(10);
      expect(deck.questionVersionIds.length).toBe(15);
    });

    it('verifies referential integrity across all items without orphan or broken references', () => {
      const knowledgeVersionSet = new Set(
        n1Dataset.knowledges.map((k) => k.versionId),
      );
      const questionVersionSet = new Set(
        n1Dataset.questions.map((q) => q.versionId),
      );
      const scenarioVersionSet = new Set(
        n1Dataset.scenarios.map((s) => s.versionId),
      );

      // Check scenario references
      for (const s of n1Dataset.scenarios) {
        for (const qvId of s.questionVersionIds) {
          expect(questionVersionSet.has(qvId)).toBe(true);
        }
        for (const kvId of s.knowledgeVersionIds) {
          expect(knowledgeVersionSet.has(kvId)).toBe(true);
        }
      }

      // Check deck references
      const deck = n1Dataset.decks[0];
      for (const svId of deck.scenarioVersionIds) {
        expect(scenarioVersionSet.has(svId)).toBe(true);
      }
      for (const kvId of deck.knowledgeVersionIds) {
        expect(knowledgeVersionSet.has(kvId)).toBe(true);
      }
      for (const qvId of deck.questionVersionIds) {
        expect(questionVersionSet.has(qvId)).toBe(true);
      }
    });
  });
});
