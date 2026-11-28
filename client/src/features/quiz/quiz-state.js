/** @typedef {import('./quiz-api.js').QuizPublic} QuizPublic */
/** @typedef {import('./quiz-api.js').QuizQuestion} QuizQuestion */
/** @typedef {import('./quiz-api.js').SubmitIntent} SubmitIntent */
/** @typedef {{ optionId?: string, text?: string }} DraftAnswer */
/** @typedef {'answering'|'confirmingBlank'|'submitting'|'submitUnknown'} QuizPhase */
/** @typedef {{ index: number, draft: Record<string, DraftAnswer>, phase: QuizPhase, intent: SubmitIntent|null, notice: string }} QuizState */

export function createQuizState() {
  return /** @type {QuizState} */ ({
    index: 0,
    draft: {},
    phase: 'answering',
    intent: null,
    notice: '',
  });
}

/**
 * @param {QuizQuestion} question
 * @param {DraftAnswer|undefined} answer
 */
export function isAnswered(question, answer) {
  if (!answer) return false;
  return question.type === 'multipleChoice'
    ? Boolean(answer.optionId)
    : Boolean(answer.text?.trim());
}

/**
 * @param {QuizPublic} quiz
 * @param {Record<string, DraftAnswer>} draft
 */
export function countUnanswered(quiz, draft) {
  return quiz.questions.filter(
    (question) => !isAnswered(question, draft[question.questionVersionId]),
  ).length;
}

/**
 * @param {QuizPublic} quiz
 * @param {Record<string, DraftAnswer>} draft
 */
export function hasDraft(quiz, draft) {
  return quiz.questions.some((question) =>
    isAnswered(question, draft[question.questionVersionId]),
  );
}

/**
 * @param {QuizPublic} quiz
 * @param {Record<string, DraftAnswer>} draft
 */
export function buildSubmitBody(quiz, draft) {
  /** @type {import('./quiz-api.js').QuizAnswer[]} */
  const answers = [];
  for (const question of quiz.questions) {
    const answer = draft[question.questionVersionId];
    if (!isAnswered(question, answer)) continue;
    answers.push(
      question.type === 'multipleChoice'
        ? {
            questionVersionId: question.questionVersionId,
            optionId: answer?.optionId,
          }
        : {
            questionVersionId: question.questionVersionId,
            text: answer?.text?.trim(),
          },
    );
  }
  return { expectedVersion: quiz.version, answers };
}

/**
 * @param {QuizState} state
 * @param {QuizPublic} quiz
 * @param {string} key
 */
function startSubmit(state, quiz, key) {
  return /** @type {QuizState} */ ({
    ...state,
    phase: 'submitting',
    notice: '',
    intent: { key, body: buildSubmitBody(quiz, state.draft) },
  });
}

/**
 * @param {QuizState} state
 * @param {{ type: 'answer', questionVersionId: string, answer: DraftAnswer }
 *  | { type: 'go', index: number, total: number }
 *  | { type: 'request-submit', quiz: QuizPublic, key: string }
 *  | { type: 'cancel-confirm' }
 *  | { type: 'confirm-submit', quiz: QuizPublic, key: string }
 *  | { type: 'submit-uncertain', notice: string }
 *  | { type: 'retry-submit' }
 *  | { type: 'submit-rejected', notice: string }} action
 * @returns {QuizState}
 */
export function quizReducer(state, action) {
  switch (action.type) {
    case 'answer':
      if (state.phase !== 'answering') return state;
      return {
        ...state,
        notice: '',
        draft: { ...state.draft, [action.questionVersionId]: action.answer },
      };
    case 'go':
      return {
        ...state,
        index: Math.min(Math.max(action.index, 0), action.total - 1),
      };
    case 'request-submit':
      if (state.phase !== 'answering') return state;
      return countUnanswered(action.quiz, state.draft) > 0
        ? { ...state, phase: 'confirmingBlank' }
        : startSubmit(state, action.quiz, action.key);
    case 'cancel-confirm':
      return state.phase === 'confirmingBlank'
        ? { ...state, phase: 'answering' }
        : state;
    case 'confirm-submit':
      return state.phase === 'confirmingBlank'
        ? startSubmit(state, action.quiz, action.key)
        : state;
    case 'submit-uncertain':
      return state.phase === 'submitting'
        ? { ...state, phase: 'submitUnknown', notice: action.notice }
        : state;
    case 'retry-submit':
      return state.phase === 'submitUnknown' && state.intent
        ? { ...state, phase: 'submitting', notice: '' }
        : state;
    case 'submit-rejected':
      return state.phase === 'submitting'
        ? { ...state, phase: 'answering', intent: null, notice: action.notice }
        : state;
    default:
      return state;
  }
}
