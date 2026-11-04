/**
 * Validator cho dữ liệu học liệu (DATA-001, BE-003, BE-013).
 *
 * Đáp ứng:
 * - docs/design/06-database-design.md §7.2
 * - docs/design/07-api-specification.md §9
 * - docs/design/03-product-backlog.md PB-31
 */

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
export const VALID_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
export const VALID_CONTENT_KINDS = [
  'deck',
  'scenario',
  'knowledge',
  'question',
];

/**
 * Kiểm tra chuỗi có phải là ObjectId 24 ký tự hex hợp lệ.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isValidObjectId(id) {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

/**
 * Validate payload của mục kiến thức (knowledge).
 * @param {Record<string, any>} payload
 * @param {string} [identifier='knowledge']
 * @returns {string[]} Danh sách lỗi (rỗng nếu hợp lệ)
 */
export function validateKnowledgePayload(payload, identifier = 'knowledge') {
  /** @type {string[]} */
  const errors = [];
  const prefix = `Knowledge[${identifier}]`;

  if (!payload || typeof payload !== 'object') {
    return [`${prefix}: payload phải là một object.`];
  }

  if (!['vocabulary', 'grammar'].includes(payload.type)) {
    errors.push(`${prefix}: type phải là 'vocabulary' hoặc 'grammar'.`);
  }

  if (typeof payload.expression !== 'string' || !payload.expression.trim()) {
    errors.push(
      `${prefix}: expression (từ/cấu trúc tiếng Nhật) không được để trống.`,
    );
  }

  if (typeof payload.meaning !== 'string' || !payload.meaning.trim()) {
    errors.push(
      `${prefix}: meaning (giải nghĩa tiếng Việt) không được để trống.`,
    );
  }

  if (payload.reading !== undefined && typeof payload.reading !== 'string') {
    errors.push(`${prefix}: reading nếu có phải là chuỗi string.`);
  }

  if (!Array.isArray(payload.examples) || payload.examples.length === 0) {
    errors.push(
      `${prefix}: examples phải là mảng có ít nhất một ví dụ minh họa.`,
    );
  } else {
    for (let i = 0; i < payload.examples.length; i++) {
      const ex = payload.examples[i];
      if (!ex || typeof ex !== 'object') {
        errors.push(
          `${prefix}.examples[${i}]: ví dụ phải là một object có 'japanese' và 'vietnamese'.`,
        );
        continue;
      }
      if (typeof ex.japanese !== 'string' || !ex.japanese.trim()) {
        errors.push(
          `${prefix}.examples[${i}]: câu tiếng Nhật 'japanese' không được để trống.`,
        );
      }
      if (typeof ex.vietnamese !== 'string' || !ex.vietnamese.trim()) {
        errors.push(
          `${prefix}.examples[${i}]: nghĩa tiếng Việt 'vietnamese' không được để trống.`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validate payload của câu hỏi quiz (question).
 * @param {Record<string, any>} payload
 * @param {Set<string>|null} [validKnowledgeIds=null] Nếu truyền Set, sẽ kiểm tra sự tồn tại của ID
 * @param {string} [identifier='question']
 * @returns {string[]}
 */
export function validateQuestionPayload(
  payload,
  validKnowledgeIds = null,
  identifier = 'question',
) {
  /** @type {string[]} */
  const errors = [];
  const prefix = `Question[${identifier}]`;

  if (!payload || typeof payload !== 'object') {
    return [`${prefix}: payload phải là một object.`];
  }

  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    errors.push(`${prefix}: prompt không được để trống.`);
  }

  if (typeof payload.explanation !== 'string' || !payload.explanation.trim()) {
    errors.push(`${prefix}: explanation không được để trống.`);
  }

  if (payload.type === 'multipleChoice') {
    if (!Array.isArray(payload.options) || payload.options.length < 2) {
      errors.push(
        `${prefix}: trắc nghiệm phải có mảng options chứa ít nhất 2 lựa chọn.`,
      );
    } else {
      /** @type {Set<string>} */
      const optionIds = new Set();
      for (let i = 0; i < payload.options.length; i++) {
        const opt = payload.options[i];
        if (!opt || typeof opt !== 'object') {
          errors.push(
            `${prefix}.options[${i}]: option phải là object có 'id' và 'text'.`,
          );
          continue;
        }
        if (typeof opt.id !== 'string' || !opt.id.trim()) {
          errors.push(
            `${prefix}.options[${i}]: option phải có id kiểu string không rỗng.`,
          );
        } else {
          if (optionIds.has(opt.id)) {
            errors.push(
              `${prefix}.options[${i}]: trùng lặp option id '${opt.id}'.`,
            );
          }
          optionIds.add(opt.id);
        }
        if (typeof opt.text !== 'string' || !opt.text.trim()) {
          errors.push(
            `${prefix}.options[${i}]: text của option không được để trống.`,
          );
        }
      }

      if (!payload.correctOptionId || !optionIds.has(payload.correctOptionId)) {
        errors.push(
          `${prefix}: correctOptionId '${payload.correctOptionId}' phải nằm trong danh sách options.`,
        );
      }
    }
  } else if (payload.type === 'shortAnswer') {
    if (
      !Array.isArray(payload.acceptedAnswers) ||
      payload.acceptedAnswers.length === 0
    ) {
      errors.push(
        `${prefix}: câu điền ngắn phải có ít nhất một acceptedAnswers.`,
      );
    } else {
      for (let i = 0; i < payload.acceptedAnswers.length; i++) {
        const ans = payload.acceptedAnswers[i];
        if (typeof ans !== 'string' || !ans.trim()) {
          errors.push(
            `${prefix}.acceptedAnswers[${i}]: đáp án được chấp nhận không được để trống.`,
          );
        }
      }
    }
  } else {
    errors.push(`${prefix}: type phải là 'multipleChoice' hoặc 'shortAnswer'.`);
  }

  if (payload.knowledgeIds !== undefined) {
    if (!Array.isArray(payload.knowledgeIds)) {
      errors.push(`${prefix}: knowledgeIds nếu có phải là mảng ID.`);
    } else {
      for (let i = 0; i < payload.knowledgeIds.length; i++) {
        const kId = payload.knowledgeIds[i];
        if (!isValidObjectId(kId)) {
          errors.push(
            `${prefix}.knowledgeIds[${i}]: ID '${kId}' không đúng chuẩn ObjectId.`,
          );
        } else if (
          validKnowledgeIds instanceof Set &&
          !validKnowledgeIds.has(kId)
        ) {
          errors.push(
            `${prefix}.knowledgeIds[${i}]: tham chiếu tới knowledge ID '${kId}' không tồn tại.`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Validate payload của tình huống (scenario).
 * @param {Record<string, any>} payload
 * @param {object} [options={}]
 * @param {boolean} [options.isPublishing=true] Nếu true, bắt buộc phải có ít nhất 3 questionIds
 * @param {Set<string>|null} [options.validKnowledgeIds=null]
 * @param {Set<string>|null} [options.validQuestionIds=null]
 * @param {string} [identifier='scenario']
 * @returns {string[]}
 */
export function validateScenarioPayload(
  payload,
  {
    isPublishing = true,
    validKnowledgeIds = null,
    validQuestionIds = null,
  } = {},
  identifier = 'scenario',
) {
  /** @type {string[]} */
  const errors = [];
  const prefix = `Scenario[${identifier}]`;

  if (!payload || typeof payload !== 'object') {
    return [`${prefix}: payload phải là một object.`];
  }

  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    errors.push(`${prefix}: title không được để trống.`);
  }

  if (typeof payload.context !== 'string' || !payload.context.trim()) {
    errors.push(`${prefix}: context (bối cảnh) không được để trống.`);
  }

  if (typeof payload.objective !== 'string' || !payload.objective.trim()) {
    errors.push(
      `${prefix}: objective (mục tiêu giao tiếp) không được để trống.`,
    );
  }

  if (typeof payload.roleA !== 'string' || !payload.roleA.trim()) {
    errors.push(`${prefix}: roleA (vai A) không được để trống.`);
  }

  if (typeof payload.roleB !== 'string' || !payload.roleB.trim()) {
    errors.push(`${prefix}: roleB (vai B) không được để trống.`);
  }

  if (!Array.isArray(payload.hints) || payload.hints.length === 0) {
    errors.push(
      `${prefix}: hints phải là mảng chứa ít nhất một gợi ý diễn đạt.`,
    );
  } else {
    for (let i = 0; i < payload.hints.length; i++) {
      const hint = payload.hints[i];
      if (typeof hint !== 'string' || !hint.trim()) {
        errors.push(
          `${prefix}.hints[${i}]: gợi ý diễn đạt không được để trống.`,
        );
      }
    }
  }

  // Tiêu chí bắt buộc cho xuất bản và dữ liệu seed: tối thiểu 3 câu quiz
  if (isPublishing) {
    if (!Array.isArray(payload.questionIds) || payload.questionIds.length < 3) {
      errors.push(
        `${prefix}: mỗi tình huống bắt buộc phải có ít nhất 3 questionIds tương ứng khi xuất bản.`,
      );
    }
  }

  if (Array.isArray(payload.questionIds)) {
    for (let i = 0; i < payload.questionIds.length; i++) {
      const qId = payload.questionIds[i];
      if (!isValidObjectId(qId)) {
        errors.push(
          `${prefix}.questionIds[${i}]: ID '${qId}' không đúng chuẩn ObjectId.`,
        );
      } else if (
        validQuestionIds instanceof Set &&
        !validQuestionIds.has(qId)
      ) {
        errors.push(
          `${prefix}.questionIds[${i}]: tham chiếu tới question ID '${qId}' không tồn tại.`,
        );
      }
    }
  }

  if (payload.knowledgeIds !== undefined) {
    if (!Array.isArray(payload.knowledgeIds)) {
      errors.push(`${prefix}: knowledgeIds phải là mảng ID.`);
    } else {
      for (let i = 0; i < payload.knowledgeIds.length; i++) {
        const kId = payload.knowledgeIds[i];
        if (!isValidObjectId(kId)) {
          errors.push(
            `${prefix}.knowledgeIds[${i}]: ID '${kId}' không đúng chuẩn ObjectId.`,
          );
        } else if (
          validKnowledgeIds instanceof Set &&
          !validKnowledgeIds.has(kId)
        ) {
          errors.push(
            `${prefix}.knowledgeIds[${i}]: tham chiếu tới knowledge ID '${kId}' không tồn tại.`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Validate payload của bộ chủ đề (deck).
 * @param {Record<string, any>} payload
 * @param {object} [options={}]
 * @param {boolean} [options.isPublishing=true] Nếu true, bắt buộc phải có ít nhất 1 scenario
 * @param {Set<string>|null} [options.validScenarioIds=null]
 * @param {string} [identifier='deck']
 * @returns {string[]}
 */
export function validateDeckPayload(
  payload,
  { isPublishing = true, validScenarioIds = null } = {},
  identifier = 'deck',
) {
  /** @type {string[]} */
  const errors = [];
  const prefix = `Deck[${identifier}]`;

  if (!payload || typeof payload !== 'object') {
    return [`${prefix}: payload phải là một object.`];
  }

  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    errors.push(`${prefix}: title không được để trống.`);
  }

  if (typeof payload.topicKey !== 'string' || !payload.topicKey.trim()) {
    errors.push(`${prefix}: topicKey không được để trống.`);
  }

  if (!VALID_LEVELS.includes(payload.level)) {
    errors.push(
      `${prefix}: level phải thuộc một trong các cấp độ ${VALID_LEVELS.join(', ')}.`,
    );
  }

  if (typeof payload.description !== 'string' || !payload.description.trim()) {
    errors.push(`${prefix}: description không được để trống.`);
  }

  if (isPublishing) {
    if (
      !Array.isArray(payload.scenarioIds) ||
      payload.scenarioIds.length === 0
    ) {
      errors.push(
        `${prefix}: bộ chủ đề xuất bản phải có ít nhất một scenarioIds.`,
      );
    }
  }

  if (Array.isArray(payload.scenarioIds)) {
    for (let i = 0; i < payload.scenarioIds.length; i++) {
      const sId = payload.scenarioIds[i];
      if (!isValidObjectId(sId)) {
        errors.push(
          `${prefix}.scenarioIds[${i}]: ID '${sId}' không đúng chuẩn ObjectId.`,
        );
      } else if (
        validScenarioIds instanceof Set &&
        !validScenarioIds.has(sId)
      ) {
        errors.push(
          `${prefix}.scenarioIds[${i}]: tham chiếu tới scenario ID '${sId}' không tồn tại.`,
        );
      }
    }
  }

  return errors;
}

/**
 * Kiểm tra toàn bộ gói dữ liệu seed học liệu (DATA-001 / DATA-002).
 * @param {Record<string, any>} dataset
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateSeedDataset(dataset) {
  /** @type {string[]} */
  const allErrors = [];

  if (!dataset || typeof dataset !== 'object') {
    return { isValid: false, errors: ['Dataset phải là một object.'] };
  }

  /** @type {Record<string, any>[]} */
  const knowledges = Array.isArray(dataset.knowledges)
    ? dataset.knowledges
    : [];
  /** @type {Record<string, any>[]} */
  const questions = Array.isArray(dataset.questions) ? dataset.questions : [];
  /** @type {Record<string, any>[]} */
  const scenarios = Array.isArray(dataset.scenarios) ? dataset.scenarios : [];
  /** @type {Record<string, any>[]} */
  const decks = Array.isArray(dataset.decks) ? dataset.decks : [];

  if (
    knowledges.length === 0 &&
    questions.length === 0 &&
    scenarios.length === 0 &&
    decks.length === 0
  ) {
    return {
      isValid: false,
      errors: ['Dataset không chứa bất kỳ học liệu nào.'],
    };
  }

  // 1. Kiểm tra _id hợp lệ và không trùng lặp
  /** @type {Map<string, string>} */
  const allIds = new Map();

  /**
   * @param {Record<string, any>} item
   * @param {string} kind
   * @param {number} idx
   */
  const registerId = (item, kind, idx) => {
    const id = item?._id;
    if (!isValidObjectId(id)) {
      allErrors.push(
        `${kind}[${id || idx}]: _id '${id}' không phải ObjectId 24 hex hợp lệ.`,
      );
      return;
    }
    if (allIds.has(id)) {
      allErrors.push(
        `${kind}[${id}]: trùng lặp _id với một record khác (${allIds.get(id)}).`,
      );
    } else {
      allIds.set(id, `${kind}[${id}]`);
    }
  };

  for (let i = 0; i < knowledges.length; i++)
    registerId(knowledges[i], 'Knowledge', i);
  for (let i = 0; i < questions.length; i++)
    registerId(questions[i], 'Question', i);
  for (let i = 0; i < scenarios.length; i++)
    registerId(scenarios[i], 'Scenario', i);
  for (let i = 0; i < decks.length; i++) registerId(decks[i], 'Deck', i);

  /** @type {Set<string>} */
  const validKnowledgeIds = new Set(
    knowledges.map((k) => k._id).filter(isValidObjectId),
  );
  /** @type {Set<string>} */
  const validQuestionIds = new Set(
    questions.map((q) => q._id).filter(isValidObjectId),
  );
  /** @type {Set<string>} */
  const validScenarioIds = new Set(
    scenarios.map((s) => s._id).filter(isValidObjectId),
  );

  // 2. Kiểm tra chi tiết payload từng loại
  for (let i = 0; i < knowledges.length; i++) {
    const k = knowledges[i];
    allErrors.push(...validateKnowledgePayload(k, k?._id || String(i)));
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    allErrors.push(
      ...validateQuestionPayload(q, validKnowledgeIds, q?._id || String(i)),
    );
  }

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    allErrors.push(
      ...validateScenarioPayload(
        s,
        { isPublishing: true, validKnowledgeIds, validQuestionIds },
        s?._id || String(i),
      ),
    );
  }

  for (let i = 0; i < decks.length; i++) {
    const d = decks[i];
    allErrors.push(
      ...validateDeckPayload(
        d,
        { isPublishing: true, validScenarioIds },
        d?._id || String(i),
      ),
    );
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}
