import mongoose from 'mongoose';

/**
 * Validator cho dữ liệu học liệu (DATA-001, BE-003, BE-013).
 *
 * Đáp ứng:
 * - docs/design/06-database-design.md §7.2
 * - docs/design/07-api-specification.md §9, §10
 * - docs/design/03-product-backlog.md PB-31
 */

const { ObjectId } = mongoose.Types;
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
 * Kiểm tra mảng versionId: hợp lệ ObjectId, không trùng lặp, tồn tại trong tập hợp cho phép.
 * @param {unknown[]} ids
 * @param {string} fieldName
 * @param {string} prefix
 * @param {Set<string>|null} validSet
 * @param {string} kindLabel
 * @returns {string[]}
 */
function validateVersionIdArray(ids, fieldName, prefix, validSet, kindLabel) {
  /** @type {string[]} */
  const errors = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (let i = 0; i < ids.length; i++) {
    const rawId = ids[i];
    if (typeof rawId !== 'string' || !isValidObjectId(rawId)) {
      errors.push(
        `${prefix}.${fieldName}[${i}]: ID '${rawId}' không đúng chuẩn ObjectId.`,
      );
    } else {
      const normalizedId = rawId.trim().toLowerCase();
      if (seen.has(normalizedId)) {
        errors.push(
          `${prefix}.${fieldName}[${i}]: ID '${rawId}' bị trùng lặp trong cùng mảng.`,
        );
      } else {
        seen.add(normalizedId);
      }
      if (
        validSet instanceof Set &&
        !validSet.has(rawId) &&
        !validSet.has(normalizedId)
      ) {
        errors.push(
          `${prefix}.${fieldName}[${i}]: tham chiếu tới ${kindLabel} versionId '${rawId}' không tồn tại.`,
        );
      }
    }
  }
  return errors;
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
 * @param {Set<string>|null} [validKnowledgeVersionIds=null] Nếu truyền Set, sẽ kiểm tra sự tồn tại của versionId
 * @param {string} [identifier='question']
 * @returns {string[]}
 */
export function validateQuestionPayload(
  payload,
  validKnowledgeVersionIds = null,
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
    errors.push(
      `${prefix}: không được dùng trường cũ 'knowledgeIds', phải dùng 'knowledgeVersionIds' theo contract Database Design §7.2.`,
    );
  }

  const knowledgeVersionIds = payload.knowledgeVersionIds;

  if (knowledgeVersionIds !== undefined) {
    if (!Array.isArray(knowledgeVersionIds)) {
      errors.push(`${prefix}: knowledgeVersionIds nếu có phải là mảng ID.`);
    } else {
      errors.push(
        ...validateVersionIdArray(
          knowledgeVersionIds,
          'knowledgeVersionIds',
          prefix,
          validKnowledgeVersionIds,
          'knowledge',
        ),
      );
    }
  }

  return errors;
}

/**
 * Validate payload của tình huống (scenario).
 * @param {Record<string, any>} payload
 * @param {object} [options={}]
 * @param {boolean} [options.isPublishing=true] Nếu true, bắt buộc phải có ít nhất 3 questionVersionIds
 * @param {Set<string>|null} [options.validKnowledgeVersionIds=null]
 * @param {Set<string>|null} [options.validQuestionVersionIds=null]
 * @param {string} [identifier='scenario']
 * @returns {string[]}
 */
export function validateScenarioPayload(
  payload,
  {
    isPublishing = true,
    validKnowledgeVersionIds = null,
    validQuestionVersionIds = null,
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

  if (payload.questionIds !== undefined) {
    errors.push(
      `${prefix}: không được dùng trường cũ 'questionIds', phải dùng 'questionVersionIds' theo contract Database Design §7.2.`,
    );
  }

  if (payload.knowledgeIds !== undefined) {
    errors.push(
      `${prefix}: không được dùng trường cũ 'knowledgeIds', phải dùng 'knowledgeVersionIds' theo contract Database Design §7.2.`,
    );
  }

  const questionVersionIds = payload.questionVersionIds;

  if (questionVersionIds !== undefined) {
    if (!Array.isArray(questionVersionIds)) {
      errors.push(`${prefix}: questionVersionIds phải là mảng ID.`);
    } else {
      errors.push(
        ...validateVersionIdArray(
          questionVersionIds,
          'questionVersionIds',
          prefix,
          validQuestionVersionIds,
          'question',
        ),
      );
    }
  }

  if (isPublishing) {
    const distinctCount = Array.isArray(questionVersionIds)
      ? new Set(questionVersionIds).size
      : 0;
    if (distinctCount < 3) {
      errors.push(
        `${prefix}: mỗi tình huống bắt buộc phải có ít nhất 3 questionVersionIds tương ứng khi xuất bản.`,
      );
    }
  }

  const knowledgeVersionIds = payload.knowledgeVersionIds;

  if (knowledgeVersionIds !== undefined) {
    if (!Array.isArray(knowledgeVersionIds)) {
      errors.push(`${prefix}: knowledgeVersionIds phải là mảng ID.`);
    } else {
      errors.push(
        ...validateVersionIdArray(
          knowledgeVersionIds,
          'knowledgeVersionIds',
          prefix,
          validKnowledgeVersionIds,
          'knowledge',
        ),
      );
    }
  }

  return errors;
}

/**
 * Validate payload của bộ chủ đề (deck).
 * @param {Record<string, any>} payload
 * @param {object} [options={}]
 * @param {boolean} [options.isPublishing=true] Nếu true, bắt buộc phải có ít nhất 1 scenario
 * @param {Set<string>|null} [options.validScenarioVersionIds=null]
 * @param {Set<string>|null} [options.validKnowledgeVersionIds=null]
 * @param {Set<string>|null} [options.validQuestionVersionIds=null]
 * @param {string} [identifier='deck']
 * @returns {string[]}
 */
export function validateDeckPayload(
  payload,
  {
    isPublishing = true,
    validScenarioVersionIds = null,
    validKnowledgeVersionIds = null,
    validQuestionVersionIds = null,
  } = {},
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

  if (payload.scenarioIds !== undefined) {
    errors.push(
      `${prefix}: không được dùng trường cũ 'scenarioIds', phải dùng 'scenarioVersionIds' theo contract Database Design §7.2.`,
    );
  }

  if (payload.knowledgeIds !== undefined) {
    errors.push(
      `${prefix}: không được dùng trường cũ 'knowledgeIds', phải dùng 'knowledgeVersionIds' theo contract Database Design §7.2.`,
    );
  }

  if (payload.questionIds !== undefined) {
    errors.push(
      `${prefix}: không được dùng trường cũ 'questionIds', phải dùng 'questionVersionIds' theo contract Database Design §7.2.`,
    );
  }

  const scenarioVersionIds = payload.scenarioVersionIds;

  if (scenarioVersionIds !== undefined) {
    if (!Array.isArray(scenarioVersionIds)) {
      errors.push(`${prefix}: scenarioVersionIds phải là mảng ID.`);
    } else {
      errors.push(
        ...validateVersionIdArray(
          scenarioVersionIds,
          'scenarioVersionIds',
          prefix,
          validScenarioVersionIds,
          'scenario',
        ),
      );
    }
  }

  if (isPublishing) {
    const distinctCount = Array.isArray(scenarioVersionIds)
      ? new Set(scenarioVersionIds).size
      : 0;
    if (distinctCount === 0) {
      errors.push(
        `${prefix}: bộ chủ đề xuất bản phải có ít nhất một scenarioVersionIds.`,
      );
    }
  }

  const knowledgeVersionIds = payload.knowledgeVersionIds;

  if (knowledgeVersionIds !== undefined) {
    if (!Array.isArray(knowledgeVersionIds)) {
      errors.push(`${prefix}: knowledgeVersionIds phải là mảng ID.`);
    } else {
      errors.push(
        ...validateVersionIdArray(
          knowledgeVersionIds,
          'knowledgeVersionIds',
          prefix,
          validKnowledgeVersionIds,
          'knowledge',
        ),
      );
    }
  }

  const questionVersionIds = payload.questionVersionIds;

  if (questionVersionIds !== undefined) {
    if (!Array.isArray(questionVersionIds)) {
      errors.push(`${prefix}: questionVersionIds phải là mảng ID.`);
    } else {
      errors.push(
        ...validateVersionIdArray(
          questionVersionIds,
          'questionVersionIds',
          prefix,
          validQuestionVersionIds,
          'question',
        ),
      );
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

  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
    return { isValid: false, errors: ['Dataset phải là một object.'] };
  }

  const groupKeys = /** @type {const} */ ([
    'knowledges',
    'questions',
    'scenarios',
    'decks',
  ]);
  for (let i = 0; i < groupKeys.length; i++) {
    const key = groupKeys[i];
    if (dataset[key] !== undefined && !Array.isArray(dataset[key])) {
      allErrors.push(`Dataset.${key} phải là một mảng nếu được cung cấp.`);
    }
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
    allErrors.length === 0 &&
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

  // 1. Kiểm tra định danh nội dung (contentId), phiên bản (versionId) và revision
  /** @type {Map<string, string>} */
  const allContentIds = new Map();
  /** @type {Map<string, string>} */
  const allVersionIds = new Map();

  /**
   * @param {Record<string, any>} item
   * @param {string} kind
   * @param {number} idx
   */
  const registerRecord = (item, kind, idx) => {
    if (!item || typeof item !== 'object') {
      allErrors.push(`${kind}[${idx}]: bản ghi phải là một object.`);
      return;
    }

    const rawContentId =
      item.contentId !== undefined ? item.contentId : item._id;
    const contentId = rawContentId;
    if (!isValidObjectId(contentId)) {
      allErrors.push(
        `${kind}[${idx}]: contentId '${contentId}' không phải ObjectId 24 ký tự hex hợp lệ.`,
      );
    } else {
      if (allContentIds.has(contentId)) {
        allErrors.push(
          `${kind}[${contentId}]: trùng lặp contentId '${contentId}' với một record khác (${allContentIds.get(contentId)}).`,
        );
      } else {
        allContentIds.set(contentId, `${kind}[${contentId}]`);
      }
      if (
        item.contentId !== undefined &&
        item._id !== undefined &&
        item._id !== item.contentId
      ) {
        allErrors.push(
          `${kind}[${idx}]: _id '${item._id}' phải bằng contentId '${item.contentId}' vì _id chính là contentId khi lưu vào content_items.`,
        );
      }
    }

    const versionId = item.versionId;
    if (!isValidObjectId(versionId)) {
      allErrors.push(
        `${kind}[${idx}]: versionId '${versionId}' không phải ObjectId 24 ký tự hex hợp lệ.`,
      );
    } else {
      if (allVersionIds.has(versionId)) {
        allErrors.push(
          `${kind}[${versionId}]: trùng lặp versionId '${versionId}' với một record khác (${allVersionIds.get(versionId)}).`,
        );
      } else {
        allVersionIds.set(versionId, `${kind}[${versionId}]`);
      }
    }

    // Kiểm tra revision: Số phiên bản nguyên dương (>= 1) theo Database Design §7.2 và checklist
    if (
      typeof item.revision !== 'number' ||
      !Number.isInteger(item.revision) ||
      item.revision < 1
    ) {
      allErrors.push(
        `${kind}[${idx}]: revision bắt buộc phải là số nguyên dương (>= 1).`,
      );
    }
  };

  for (let i = 0; i < knowledges.length; i++)
    registerRecord(knowledges[i], 'Knowledge', i);
  for (let i = 0; i < questions.length; i++)
    registerRecord(questions[i], 'Question', i);
  for (let i = 0; i < scenarios.length; i++)
    registerRecord(scenarios[i], 'Scenario', i);
  for (let i = 0; i < decks.length; i++) registerRecord(decks[i], 'Deck', i);

  /**
   * Theo Database Design §7.2:
   * knowledgeVersionIds, questionVersionIds, scenarioVersionIds bắt buộc trỏ tới versionId
   * (content_versions._id) của bản xuất bản, TUYỆT ĐỐI KHÔNG trỏ tới contentId.
   */
  /** @type {Set<string>} */
  const validKnowledgeVersionIds = new Set();
  for (let i = 0; i < knowledges.length; i++) {
    const k = knowledges[i];
    if (k && typeof k === 'object' && isValidObjectId(k.versionId)) {
      validKnowledgeVersionIds.add(k.versionId);
    }
  }

  /** @type {Set<string>} */
  const validQuestionVersionIds = new Set();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q && typeof q === 'object' && isValidObjectId(q.versionId)) {
      validQuestionVersionIds.add(q.versionId);
    }
  }

  /** @type {Set<string>} */
  const validScenarioVersionIds = new Set();
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    if (s && typeof s === 'object' && isValidObjectId(s.versionId)) {
      validScenarioVersionIds.add(s.versionId);
    }
  }

  // 2. Kiểm tra chi tiết payload từng loại
  for (let i = 0; i < knowledges.length; i++) {
    const k = knowledges[i];
    if (k && typeof k === 'object') {
      const id =
        k.contentId !== undefined
          ? k.contentId
          : k._id !== undefined
            ? k._id
            : String(i);
      allErrors.push(...validateKnowledgePayload(k, id));
    }
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q && typeof q === 'object') {
      const id =
        q.contentId !== undefined
          ? q.contentId
          : q._id !== undefined
            ? q._id
            : String(i);
      allErrors.push(
        ...validateQuestionPayload(q, validKnowledgeVersionIds, id),
      );
    }
  }

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    if (s && typeof s === 'object') {
      const id =
        s.contentId !== undefined
          ? s.contentId
          : s._id !== undefined
            ? s._id
            : String(i);
      allErrors.push(
        ...validateScenarioPayload(
          s,
          {
            isPublishing: true,
            validKnowledgeVersionIds,
            validQuestionVersionIds,
          },
          id,
        ),
      );
    }
  }

  for (let i = 0; i < decks.length; i++) {
    const d = decks[i];
    if (d && typeof d === 'object') {
      const id =
        d.contentId !== undefined
          ? d.contentId
          : d._id !== undefined
            ? d._id
            : String(i);
      allErrors.push(
        ...validateDeckPayload(
          d,
          {
            isPublishing: true,
            validScenarioVersionIds,
            validKnowledgeVersionIds,
            validQuestionVersionIds,
          },
          id,
        ),
      );
    }
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * @typedef {{ path: string, code: string, message: string }} FieldValidationError
 */

/**
 * Validate input cho API tạo hoặc cập nhật nháp học liệu (BE-003).
 * Trả về mảng các lỗi trường theo contract 07 §2.3.
 *
 * @param {{ kind?: unknown, draftPayload?: unknown }} input
 * @returns {FieldValidationError[]}
 */
export function validateContentItemDraftInput({ kind, draftPayload }) {
  /** @type {FieldValidationError[]} */
  const fields = [];

  if (
    !kind ||
    typeof kind !== 'string' ||
    !VALID_CONTENT_KINDS.includes(kind)
  ) {
    fields.push({
      path: 'kind',
      code: 'INVALID_ENUM',
      message: `Loại học liệu phải thuộc một trong các giá trị: ${VALID_CONTENT_KINDS.join(', ')}.`,
    });
  }

  if (
    !draftPayload ||
    typeof draftPayload !== 'object' ||
    Array.isArray(draftPayload)
  ) {
    fields.push({
      path: 'draftPayload',
      code: 'REQUIRED',
      message: 'Dữ liệu nháp (draftPayload) phải là một object không rỗng.',
    });
    return fields;
  }

  if (kind === 'knowledge') {
    validateKnowledgeDraftPayload(draftPayload, fields);
  } else if (kind === 'question') {
    validateQuestionDraftPayload(draftPayload, fields);
  } else if (kind === 'scenario') {
    validateScenarioDraftPayload(draftPayload, fields);
  } else if (kind === 'deck') {
    validateDeckDraftPayload(draftPayload, fields);
  }

  return fields;
}

/**
 * @param {Record<string, any>} payload
 * @param {FieldValidationError[]} fields
 */
export function validateKnowledgeDraftPayload(payload, fields) {
  if (!['vocabulary', 'grammar'].includes(payload.type)) {
    fields.push({
      path: 'draftPayload.type',
      code: 'INVALID_ENUM',
      message: "Loại kiến thức phải là 'vocabulary' hoặc 'grammar'.",
    });
  }
  if (typeof payload.expression !== 'string' || !payload.expression.trim()) {
    fields.push({
      path: 'draftPayload.expression',
      code: 'REQUIRED',
      message: 'Từ hoặc cấu trúc tiếng Nhật không được để trống.',
    });
  }
  if (typeof payload.meaning !== 'string' || !payload.meaning.trim()) {
    fields.push({
      path: 'draftPayload.meaning',
      code: 'REQUIRED',
      message: 'Giải nghĩa tiếng Việt không được để trống.',
    });
  }
  if (payload.reading !== undefined && typeof payload.reading !== 'string') {
    fields.push({
      path: 'draftPayload.reading',
      code: 'INVALID_TYPE',
      message: 'Cách đọc (reading) nếu có phải là chuỗi ký tự.',
    });
  }
  if (!Array.isArray(payload.examples) || payload.examples.length === 0) {
    fields.push({
      path: 'draftPayload.examples',
      code: 'REQUIRED',
      message: 'Kiến thức phải có ít nhất một ví dụ minh họa.',
    });
  } else {
    for (let i = 0; i < payload.examples.length; i++) {
      const ex = payload.examples[i];
      if (!ex || typeof ex !== 'object') {
        fields.push({
          path: `draftPayload.examples[${i}]`,
          code: 'INVALID_TYPE',
          message: 'Ví dụ minh họa phải là object chứa japanese và vietnamese.',
        });
        continue;
      }
      if (typeof ex.japanese !== 'string' || !ex.japanese.trim()) {
        fields.push({
          path: `draftPayload.examples[${i}].japanese`,
          code: 'REQUIRED',
          message: 'Câu tiếng Nhật của ví dụ không được để trống.',
        });
      }
      if (typeof ex.vietnamese !== 'string' || !ex.vietnamese.trim()) {
        fields.push({
          path: `draftPayload.examples[${i}].vietnamese`,
          code: 'REQUIRED',
          message: 'Nghĩa tiếng Việt của ví dụ không được để trống.',
        });
      }
    }
  }
}

/**
 * @param {unknown} value
 * @param {string} fieldPath
 * @param {FieldValidationError[]} fields
 */
function validateVersionIdField(value, fieldPath, fields) {
  if (!Array.isArray(value)) {
    fields.push({
      path: fieldPath,
      code: 'INVALID_TYPE',
      message: `${fieldPath} phải là một mảng chuỗi ObjectId.`,
    });
    return;
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i++) {
    const id = value[i];
    if (typeof id !== 'string' || !isValidObjectId(id)) {
      fields.push({
        path: `${fieldPath}[${i}]`,
        code: 'INVALID_FORMAT',
        message: `ID '${id}' không đúng chuẩn ObjectId 24 ký tự hex.`,
      });
    } else {
      if (seen.has(id)) {
        fields.push({
          path: `${fieldPath}[${i}]`,
          code: 'DUPLICATE',
          message: `ID '${id}' bị trùng lặp trong mảng.`,
        });
      }
      seen.add(id);
    }
  }
}

/**
 * @param {Record<string, any>} payload
 * @param {FieldValidationError[]} fields
 */
export function validateQuestionDraftPayload(payload, fields) {
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    fields.push({
      path: 'draftPayload.prompt',
      code: 'REQUIRED',
      message: 'Câu hỏi (prompt) không được để trống.',
    });
  }
  if (typeof payload.explanation !== 'string' || !payload.explanation.trim()) {
    fields.push({
      path: 'draftPayload.explanation',
      code: 'REQUIRED',
      message: 'Giải thích đáp án (explanation) không được để trống.',
    });
  }
  if (payload.type === 'multipleChoice') {
    if (!Array.isArray(payload.options) || payload.options.length < 2) {
      fields.push({
        path: 'draftPayload.options',
        code: 'MIN_ITEMS',
        message: 'Trắc nghiệm phải có ít nhất 2 lựa chọn trong options.',
      });
    } else {
      /** @type {Set<string>} */
      const optionIds = new Set();
      for (let i = 0; i < payload.options.length; i++) {
        const opt = payload.options[i];
        if (!opt || typeof opt !== 'object') {
          fields.push({
            path: `draftPayload.options[${i}]`,
            code: 'INVALID_TYPE',
            message: 'Option phải là object có id và text.',
          });
          continue;
        }
        if (typeof opt.id !== 'string' || !opt.id.trim()) {
          fields.push({
            path: `draftPayload.options[${i}].id`,
            code: 'REQUIRED',
            message: 'ID của option không được để trống.',
          });
        } else {
          if (optionIds.has(opt.id)) {
            fields.push({
              path: `draftPayload.options[${i}].id`,
              code: 'DUPLICATE',
              message: `ID option '${opt.id}' bị trùng lặp.`,
            });
          }
          optionIds.add(opt.id);
        }
        if (typeof opt.text !== 'string' || !opt.text.trim()) {
          fields.push({
            path: `draftPayload.options[${i}].text`,
            code: 'REQUIRED',
            message: 'Nội dung option không được để trống.',
          });
        }
      }
      if (
        !payload.correctOptionId ||
        typeof payload.correctOptionId !== 'string'
      ) {
        fields.push({
          path: 'draftPayload.correctOptionId',
          code: 'REQUIRED',
          message: 'Đáp án đúng (correctOptionId) không được để trống.',
        });
      } else if (!optionIds.has(payload.correctOptionId)) {
        fields.push({
          path: 'draftPayload.correctOptionId',
          code: 'INVALID_REFERENCE',
          message: `correctOptionId '${payload.correctOptionId}' phải nằm trong danh sách options.`,
        });
      }
    }
  } else if (payload.type === 'shortAnswer') {
    if (
      !Array.isArray(payload.acceptedAnswers) ||
      payload.acceptedAnswers.length === 0
    ) {
      fields.push({
        path: 'draftPayload.acceptedAnswers',
        code: 'REQUIRED',
        message:
          'Câu hỏi điền ngắn phải có ít nhất một đáp án chấp nhận (acceptedAnswers).',
      });
    } else {
      for (let i = 0; i < payload.acceptedAnswers.length; i++) {
        const ans = payload.acceptedAnswers[i];
        if (typeof ans !== 'string' || !ans.trim()) {
          fields.push({
            path: `draftPayload.acceptedAnswers[${i}]`,
            code: 'REQUIRED',
            message: 'Đáp án chấp nhận không được để trống.',
          });
        }
      }
    }
  } else {
    fields.push({
      path: 'draftPayload.type',
      code: 'INVALID_ENUM',
      message: "Loại câu hỏi phải là 'multipleChoice' hoặc 'shortAnswer'.",
    });
  }

  if (payload.knowledgeVersionIds !== undefined) {
    validateVersionIdField(
      payload.knowledgeVersionIds,
      'draftPayload.knowledgeVersionIds',
      fields,
    );
  }
}

/**
 * @param {Record<string, any>} payload
 * @param {FieldValidationError[]} fields
 */
export function validateScenarioDraftPayload(payload, fields) {
  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    fields.push({
      path: 'draftPayload.title',
      code: 'REQUIRED',
      message: 'Tiêu đề tình huống (title) không được để trống.',
    });
  }
  if (typeof payload.context !== 'string' || !payload.context.trim()) {
    fields.push({
      path: 'draftPayload.context',
      code: 'REQUIRED',
      message: 'Bối cảnh (context) không được để trống.',
    });
  }
  if (typeof payload.objective !== 'string' || !payload.objective.trim()) {
    fields.push({
      path: 'draftPayload.objective',
      code: 'REQUIRED',
      message: 'Mục tiêu giao tiếp (objective) không được để trống.',
    });
  }
  if (typeof payload.roleA !== 'string' || !payload.roleA.trim()) {
    fields.push({
      path: 'draftPayload.roleA',
      code: 'REQUIRED',
      message: 'Vai A (roleA) không được để trống.',
    });
  }
  if (typeof payload.roleB !== 'string' || !payload.roleB.trim()) {
    fields.push({
      path: 'draftPayload.roleB',
      code: 'REQUIRED',
      message: 'Vai B (roleB) không được để trống.',
    });
  }
  if (!Array.isArray(payload.hints) || payload.hints.length === 0) {
    fields.push({
      path: 'draftPayload.hints',
      code: 'REQUIRED',
      message: 'Tình huống phải có ít nhất một gợi ý diễn đạt (hints).',
    });
  } else {
    for (let i = 0; i < payload.hints.length; i++) {
      const hint = payload.hints[i];
      if (typeof hint !== 'string' || !hint.trim()) {
        fields.push({
          path: `draftPayload.hints[${i}]`,
          code: 'REQUIRED',
          message: 'Gợi ý diễn đạt không được để trống.',
        });
      }
    }
  }
  if (payload.knowledgeVersionIds !== undefined) {
    validateVersionIdField(
      payload.knowledgeVersionIds,
      'draftPayload.knowledgeVersionIds',
      fields,
    );
  }
  if (payload.questionVersionIds !== undefined) {
    validateVersionIdField(
      payload.questionVersionIds,
      'draftPayload.questionVersionIds',
      fields,
    );
  }
}

/**
 * @param {Record<string, any>} payload
 * @param {FieldValidationError[]} fields
 */
export function validateDeckDraftPayload(payload, fields) {
  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    fields.push({
      path: 'draftPayload.title',
      code: 'REQUIRED',
      message: 'Tiêu đề bộ chủ đề (title) không được để trống.',
    });
  }
  if (typeof payload.topicKey !== 'string' || !payload.topicKey.trim()) {
    fields.push({
      path: 'draftPayload.topicKey',
      code: 'REQUIRED',
      message: 'Mã chủ đề (topicKey) không được để trống.',
    });
  }
  if (!VALID_LEVELS.includes(payload.level)) {
    fields.push({
      path: 'draftPayload.level',
      code: 'INVALID_ENUM',
      message: `Cấp độ (level) phải thuộc một trong các giá trị: ${VALID_LEVELS.join(', ')}.`,
    });
  }
  if (typeof payload.description !== 'string' || !payload.description.trim()) {
    fields.push({
      path: 'draftPayload.description',
      code: 'REQUIRED',
      message: 'Mô tả bộ chủ đề (description) không được để trống.',
    });
  }
  if (payload.scenarioVersionIds !== undefined) {
    validateVersionIdField(
      payload.scenarioVersionIds,
      'draftPayload.scenarioVersionIds',
      fields,
    );
  }
  if (payload.knowledgeVersionIds !== undefined) {
    validateVersionIdField(
      payload.knowledgeVersionIds,
      'draftPayload.knowledgeVersionIds',
      fields,
    );
  }
  if (payload.questionVersionIds !== undefined) {
    validateVersionIdField(
      payload.questionVersionIds,
      'draftPayload.questionVersionIds',
      fields,
    );
  }
}

/**
 * Kiểm tra các versionId tham chiếu trong draftPayload có tồn tại trong content_versions và đúng loại hay không.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {string} kind
 * @param {Record<string, any>} draftPayload
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 * @returns {Promise<FieldValidationError[]>}
 */
export async function verifyDraftReferences(
  db,
  kind,
  draftPayload,
  { session } = {},
) {
  /** @type {FieldValidationError[]} */
  const errors = [];
  if (!draftPayload || typeof draftPayload !== 'object') return errors;

  /** @type {Array<{ field: string, kind: string, ids: string[] }>} */
  const checks = [];

  if (kind === 'question') {
    if (Array.isArray(draftPayload.knowledgeVersionIds)) {
      checks.push({
        field: 'draftPayload.knowledgeVersionIds',
        kind: 'knowledge',
        ids: draftPayload.knowledgeVersionIds.filter(isValidObjectId),
      });
    }
  } else if (kind === 'scenario') {
    if (Array.isArray(draftPayload.knowledgeVersionIds)) {
      checks.push({
        field: 'draftPayload.knowledgeVersionIds',
        kind: 'knowledge',
        ids: draftPayload.knowledgeVersionIds.filter(isValidObjectId),
      });
    }
    if (Array.isArray(draftPayload.questionVersionIds)) {
      checks.push({
        field: 'draftPayload.questionVersionIds',
        kind: 'question',
        ids: draftPayload.questionVersionIds.filter(isValidObjectId),
      });
    }
  } else if (kind === 'deck') {
    if (Array.isArray(draftPayload.scenarioVersionIds)) {
      checks.push({
        field: 'draftPayload.scenarioVersionIds',
        kind: 'scenario',
        ids: draftPayload.scenarioVersionIds.filter(isValidObjectId),
      });
    }
    if (Array.isArray(draftPayload.knowledgeVersionIds)) {
      checks.push({
        field: 'draftPayload.knowledgeVersionIds',
        kind: 'knowledge',
        ids: draftPayload.knowledgeVersionIds.filter(isValidObjectId),
      });
    }
    if (Array.isArray(draftPayload.questionVersionIds)) {
      checks.push({
        field: 'draftPayload.questionVersionIds',
        kind: 'question',
        ids: draftPayload.questionVersionIds.filter(isValidObjectId),
      });
    }
  }

  for (const check of checks) {
    if (check.ids.length === 0) continue;
    const objectIds = check.ids.map((id) => new ObjectId(id));
    const versions = await db
      .collection('content_versions')
      .find(
        {
          _id: { $in: objectIds },
          kind: check.kind,
        },
        { projection: { _id: 1 }, ...(session ? { session } : {}) },
      )
      .toArray();

    const foundIdSet = new Set(
      versions.map((v) => v._id.toHexString().toLowerCase()),
    );
    for (let i = 0; i < check.ids.length; i++) {
      const id = check.ids[i];
      if (!foundIdSet.has(id.toLowerCase())) {
        errors.push({
          path: `${check.field}[${i}]`,
          code: 'INVALID_REFERENCE',
          message: `Tham chiếu tới phiên bản ${check.kind} '${id}' không tồn tại hoặc sai loại học liệu.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Kiểm tra mức độ đầy đủ (completeness) và references của bản nháp trước khi xuất bản (BE-013, 07 §10, 02 BR-24, FR-ADM-03).
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {Record<string, any>} item
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 * @returns {Promise<FieldValidationError[]>}
 */
export async function validatePublishCompleteness(db, item, { session } = {}) {
  /** @type {FieldValidationError[]} */
  const errors = [];
  const draftPayload = item?.draftPayload;

  if (
    !draftPayload ||
    typeof draftPayload !== 'object' ||
    Array.isArray(draftPayload)
  ) {
    return [
      {
        path: 'draftPayload',
        code: 'REQUIRED',
        message: 'Học liệu chưa có nội dung nháp để xuất bản.',
      },
    ];
  }

  const kind = item.kind;

  if (kind === 'knowledge') {
    if (!['vocabulary', 'grammar'].includes(draftPayload.type)) {
      errors.push({
        path: 'draftPayload.type',
        code: 'INVALID_ENUM',
        message: "type phải là 'vocabulary' hoặc 'grammar'.",
      });
    }
    if (
      typeof draftPayload.expression !== 'string' ||
      !draftPayload.expression.trim()
    ) {
      errors.push({
        path: 'draftPayload.expression',
        code: 'REQUIRED',
        message: 'expression (từ/cấu trúc tiếng Nhật) không được để trống.',
      });
    }
    if (
      typeof draftPayload.meaning !== 'string' ||
      !draftPayload.meaning.trim()
    ) {
      errors.push({
        path: 'draftPayload.meaning',
        code: 'REQUIRED',
        message: 'meaning (giải nghĩa tiếng Việt) không được để trống.',
      });
    }
    if (
      draftPayload.reading !== undefined &&
      typeof draftPayload.reading !== 'string'
    ) {
      errors.push({
        path: 'draftPayload.reading',
        code: 'INVALID_TYPE',
        message: 'reading phải là chuỗi.',
      });
    }
    if (
      !Array.isArray(draftPayload.examples) ||
      draftPayload.examples.length === 0
    ) {
      errors.push({
        path: 'draftPayload.examples',
        code: 'REQUIRED',
        message:
          'examples phải là mảng chứa ít nhất 1 ví dụ câu tiếng Nhật và dịch nghĩa.',
      });
    } else {
      for (let i = 0; i < draftPayload.examples.length; i++) {
        const ex = draftPayload.examples[i];
        if (!ex || typeof ex !== 'object') {
          errors.push({
            path: `draftPayload.examples[${i}]`,
            code: 'INVALID_TYPE',
            message: 'Mỗi ví dụ phải là một object.',
          });
          continue;
        }
        if (typeof ex.japanese !== 'string' || !ex.japanese.trim()) {
          errors.push({
            path: `draftPayload.examples[${i}].japanese`,
            code: 'REQUIRED',
            message: 'japanese không được để trống.',
          });
        }
        if (typeof ex.vietnamese !== 'string' || !ex.vietnamese.trim()) {
          errors.push({
            path: `draftPayload.examples[${i}].vietnamese`,
            code: 'REQUIRED',
            message: 'vietnamese không được để trống.',
          });
        }
      }
    }
  } else if (kind === 'question') {
    if (!['multipleChoice', 'shortAnswer'].includes(draftPayload.type)) {
      errors.push({
        path: 'draftPayload.type',
        code: 'INVALID_ENUM',
        message: "type phải là 'multipleChoice' hoặc 'shortAnswer'.",
      });
    }
    if (
      typeof draftPayload.prompt !== 'string' ||
      !draftPayload.prompt.trim()
    ) {
      errors.push({
        path: 'draftPayload.prompt',
        code: 'REQUIRED',
        message: 'prompt (nội dung câu hỏi) không được để trống.',
      });
    }
    if (
      typeof draftPayload.explanation !== 'string' ||
      !draftPayload.explanation.trim()
    ) {
      errors.push({
        path: 'draftPayload.explanation',
        code: 'REQUIRED',
        message: 'explanation (giải thích đáp án) không được để trống.',
      });
    }

    if (draftPayload.type === 'multipleChoice') {
      const optionIds = new Set();
      if (
        !Array.isArray(draftPayload.options) ||
        draftPayload.options.length < 2
      ) {
        errors.push({
          path: 'draftPayload.options',
          code: 'THRESHOLD_NOT_MET',
          message:
            'options phải có ít nhất 2 lựa chọn cho câu hỏi trắc nghiệm.',
        });
      }
      if (Array.isArray(draftPayload.options)) {
        for (let i = 0; i < draftPayload.options.length; i++) {
          const opt = draftPayload.options[i];
          if (!opt || typeof opt !== 'object') {
            errors.push({
              path: `draftPayload.options[${i}]`,
              code: 'INVALID_TYPE',
              message: 'Lựa chọn phải là object.',
            });
            continue;
          }
          if (typeof opt.id !== 'string' || !opt.id.trim()) {
            errors.push({
              path: `draftPayload.options[${i}].id`,
              code: 'REQUIRED',
              message: 'id của lựa chọn không được để trống.',
            });
          } else {
            optionIds.add(opt.id.trim());
          }
          if (typeof opt.text !== 'string' || !opt.text.trim()) {
            errors.push({
              path: `draftPayload.options[${i}].text`,
              code: 'REQUIRED',
              message: 'text của lựa chọn không được để trống.',
            });
          }
        }
      }
      if (
        typeof draftPayload.correctOptionId !== 'string' ||
        !draftPayload.correctOptionId.trim() ||
        !optionIds.has(draftPayload.correctOptionId.trim())
      ) {
        errors.push({
          path: 'draftPayload.correctOptionId',
          code: 'INVALID_REFERENCE',
          message:
            'correctOptionId phải khớp với một id trong danh sách options.',
        });
      }
    } else if (draftPayload.type === 'shortAnswer') {
      if (
        !Array.isArray(draftPayload.acceptedAnswers) ||
        draftPayload.acceptedAnswers.length === 0 ||
        draftPayload.acceptedAnswers.some(
          (/** @type {any} */ ans) => typeof ans !== 'string' || !ans.trim(),
        )
      ) {
        errors.push({
          path: 'draftPayload.acceptedAnswers',
          code: 'REQUIRED',
          message:
            'acceptedAnswers phải có ít nhất một đáp án chuỗi không rỗng.',
        });
      }
    }

    // Verify knowledgeVersionIds references
    const refErrors = await verifyDraftReferences(
      db,
      'question',
      draftPayload,
      { session },
    );
    errors.push(...refErrors);
  } else if (kind === 'scenario') {
    if (typeof draftPayload.title !== 'string' || !draftPayload.title.trim()) {
      errors.push({
        path: 'draftPayload.title',
        code: 'REQUIRED',
        message: 'title không được để trống.',
      });
    }
    if (
      typeof draftPayload.context !== 'string' ||
      !draftPayload.context.trim()
    ) {
      errors.push({
        path: 'draftPayload.context',
        code: 'REQUIRED',
        message: 'context không được để trống.',
      });
    }
    if (
      typeof draftPayload.objective !== 'string' ||
      !draftPayload.objective.trim()
    ) {
      errors.push({
        path: 'draftPayload.objective',
        code: 'REQUIRED',
        message: 'objective không được để trống.',
      });
    }
    if (typeof draftPayload.roleA !== 'string' || !draftPayload.roleA.trim()) {
      errors.push({
        path: 'draftPayload.roleA',
        code: 'REQUIRED',
        message: 'roleA không được để trống.',
      });
    }
    if (typeof draftPayload.roleB !== 'string' || !draftPayload.roleB.trim()) {
      errors.push({
        path: 'draftPayload.roleB',
        code: 'REQUIRED',
        message: 'roleB không được để trống.',
      });
    }
    if (draftPayload.hints !== undefined) {
      if (
        !Array.isArray(draftPayload.hints) ||
        draftPayload.hints.some(
          (/** @type {any} */ h) => typeof h !== 'string' || !h.trim(),
        )
      ) {
        errors.push({
          path: 'draftPayload.hints',
          code: 'INVALID_TYPE',
          message: 'hints phải là mảng chuỗi không rỗng.',
        });
      }
    }

    // Ngưỡng: tối thiểu 3 câu hỏi quiz (02 FR-ADM-03, BR-24)
    const questionIds = Array.isArray(draftPayload.questionVersionIds)
      ? draftPayload.questionVersionIds.filter(isValidObjectId)
      : [];
    const distinctQuestionCount = new Set(
      questionIds.map((/** @type {any} */ id) => id.toLowerCase()),
    ).size;
    if (distinctQuestionCount < 3) {
      errors.push({
        path: 'draftPayload.questionVersionIds',
        code: 'THRESHOLD_NOT_MET',
        message: 'Mỗi tình huống xuất bản phải có tối thiểu 3 câu hỏi quiz.',
      });
    }

    // Verify references
    const refErrors = await verifyDraftReferences(
      db,
      'scenario',
      draftPayload,
      { session },
    );
    errors.push(...refErrors);
  } else if (kind === 'deck') {
    if (typeof draftPayload.title !== 'string' || !draftPayload.title.trim()) {
      errors.push({
        path: 'draftPayload.title',
        code: 'REQUIRED',
        message: 'title không được để trống.',
      });
    }
    if (
      typeof draftPayload.topicKey !== 'string' ||
      !draftPayload.topicKey.trim()
    ) {
      errors.push({
        path: 'draftPayload.topicKey',
        code: 'REQUIRED',
        message: 'topicKey không được để trống.',
      });
    }
    if (!VALID_LEVELS.includes(draftPayload.level)) {
      errors.push({
        path: 'draftPayload.level',
        code: 'INVALID_ENUM',
        message: `level phải thuộc: ${VALID_LEVELS.join(', ')}.`,
      });
    }
    if (
      typeof draftPayload.description !== 'string' ||
      !draftPayload.description.trim()
    ) {
      errors.push({
        path: 'draftPayload.description',
        code: 'REQUIRED',
        message: 'description không được để trống.',
      });
    }

    // Ngưỡng: tối thiểu 1 tình huống (02 FR-ADM-03)
    const scenarioIds = Array.isArray(draftPayload.scenarioVersionIds)
      ? draftPayload.scenarioVersionIds.filter(isValidObjectId)
      : [];
    const distinctScenarioCount = new Set(
      scenarioIds.map((/** @type {any} */ id) => id.toLowerCase()),
    ).size;
    if (distinctScenarioCount < 1) {
      errors.push({
        path: 'draftPayload.scenarioVersionIds',
        code: 'THRESHOLD_NOT_MET',
        message: 'Bộ chủ đề xuất bản phải có ít nhất 1 tình huống hoàn chỉnh.',
      });
    }

    // Verify references
    const refErrors = await verifyDraftReferences(db, 'deck', draftPayload, {
      session,
    });
    errors.push(...refErrors);
  }

  return errors;
}

/**
 * Chuẩn hóa và loại bỏ trùng lặp mảng ID tham chiếu (không phân biệt hoa/thường hex).
 * @param {unknown} ids
 * @returns {import('mongoose').Types.ObjectId[]}
 */
function normalizeObjectIdArray(ids) {
  if (!Array.isArray(ids)) return [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {import('mongoose').Types.ObjectId[]} */
  const result = [];
  for (const item of ids) {
    if (item === null || item === undefined) continue;
    const str = (item instanceof ObjectId ? item.toHexString() : String(item))
      .trim()
      .toLowerCase();
    if (isValidObjectId(str) && !seen.has(str)) {
      seen.add(str);
      result.push(new ObjectId(str));
    }
  }
  return result;
}

/**
 * Chuẩn hóa payload xuất bản, loại trùng các mảng ID tham chiếu và convert sang ObjectId (06 §7.2, TX-11).
 *
 * @param {string} kind
 * @param {Record<string, any>} draftPayload
 * @returns {Record<string, any>}
 */
export function normalizePublishPayload(kind, draftPayload) {
  const normalized = { ...draftPayload };

  if (kind === 'question') {
    normalized.knowledgeVersionIds = normalizeObjectIdArray(
      normalized.knowledgeVersionIds,
    );
  } else if (kind === 'scenario') {
    normalized.knowledgeVersionIds = normalizeObjectIdArray(
      normalized.knowledgeVersionIds,
    );
    normalized.questionVersionIds = normalizeObjectIdArray(
      normalized.questionVersionIds,
    );
  } else if (kind === 'deck') {
    normalized.scenarioVersionIds = normalizeObjectIdArray(
      normalized.scenarioVersionIds,
    );
    normalized.knowledgeVersionIds = normalizeObjectIdArray(
      normalized.knowledgeVersionIds,
    );
    normalized.questionVersionIds = normalizeObjectIdArray(
      normalized.questionVersionIds,
    );
  }

  return normalized;
}
