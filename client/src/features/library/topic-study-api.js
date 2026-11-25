import { api } from '../../services/api-client.js';
import { ensureLibraryIdentity } from './library-api.js';

/** @typedef {{cardKey: string, front: string}} StudyCard */
/** @typedef {{rating: 1|2|3, label: string, dueAt: string}} ReviewOption */
/** @typedef {{back: string, reviewTicket: string, preview: ReviewOption[]}} StudyReveal */
/** @typedef {{progress: {dueAt: string}}} ReviewReceipt */
/** @typedef {{id: string, rating: 1|2|3, reviewedAt: string, nextDueAt: string}} ReviewRecord */
/** @typedef {{questionVersionId: string, type: 'multipleChoice'|'shortAnswer', prompt: string, options?: {id: string, text: string}[]}} QuizQuestion */
/** @typedef {{questionVersionId: string, text?: string, optionId?: string}} QuizAnswer */
/** @typedef {{questionVersionId: string, isCorrect: boolean, correctOptionId?: string, acceptedAnswers?: string[], explanation?: string, knowledgeVersionIds: string[]}} QuizFeedback */
/** @typedef {{id: string, deckVersionId: string, version: number, total: number, questions: QuizQuestion[]}} QuizAttempt */
/** @typedef {QuizAttempt & {status: 'submitted', score: number, answers: QuizAnswer[], results: QuizFeedback[]}} QuizResult */
/** @typedef {(QuizAttempt & {status: 'inProgress'}) | QuizResult} Quiz */

/** @template T @param {string} path @param {unknown} body @param {{signal?: AbortSignal, idempotencyKey?: string}} options @returns {Promise<T>} */
export async function postTopicStudy(path, body, options) {
  const response = await api.post(path, body, options);
  ensureLibraryIdentity(response.epoch);
  return /** @type {T} */ (response.data);
}

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/** @param {string} date */
export function studyDate(date) {
  return dateTime.format(new Date(date));
}
