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
    const id = ids[i];
    if (typeof id !== 'string' || !isValidObjectId(id)) {
      errors.push(
        `${prefix}.${fieldName}[${i}]: ID '${id}' không đúng chuẩn ObjectId.`,
      );
    } else {
      if (seen.has(id)) {
        errors.push(
          `${prefix}.${fieldName}[${i}]: ID '${id}' bị trùng lặp trong cùng mảng.`,
        );
      } else {
        seen.add(id);
      }
      if (validSet instanceof Set && !validSet.has(id)) {
        errors.push(
          `${prefix}.${fieldName}[${i}]: tham chiếu tới ${kindLabel} versionId '${id}' không tồn tại.`,
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

  if (Array.isArray(questionVersionIds)) {
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

  if (Array.isArray(scenarioVersionIds)) {
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

    const rawVersionId =
      item.versionId !== undefined ? item.versionId : item.publishedVersionId;
    const versionId = rawVersionId;
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

  // Kiểm tra chéo sau khi toàn bộ contentId đã được đăng ký:
  // Một contentId không được trùng với bất kỳ versionId nào (§7.1 & §7.2)
  for (const [contentId, contentLabel] of allContentIds) {
    if (allVersionIds.has(contentId)) {
      allErrors.push(
        `contentId '${contentId}' (${contentLabel}) trùng với versionId của record ${allVersionIds.get(contentId)} — vi phạm tính duy nhất giữa content_items._id và content_versions._id.`,
      );
    }
  }

  /**
   * Theo Database Design §7.2:
   * knowledgeVersionIds, questionVersionIds, scenarioVersionIds bắt buộc trỏ tới versionId
   * (content_versions._id) của bản xuất bản, TUYỆT ĐỐI KHÔNG trỏ tới contentId.
   */
  /** @type {Set<string>} */
  const validKnowledgeVersionIds = new Set();
  for (let i = 0; i < knowledges.length; i++) {
    const k = knowledges[i];
    if (k && typeof k === 'object') {
      // Dùng kiểm tra tường minh để tránh falsy string ('') âm thầm fallback
      const vId =
        k.versionId !== undefined ? k.versionId : k.publishedVersionId;
      if (isValidObjectId(vId)) validKnowledgeVersionIds.add(vId);
    }
  }

  /** @type {Set<string>} */
  const validQuestionVersionIds = new Set();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q && typeof q === 'object') {
      const vId =
        q.versionId !== undefined ? q.versionId : q.publishedVersionId;
      if (isValidObjectId(vId)) validQuestionVersionIds.add(vId);
    }
  }

  /** @type {Set<string>} */
  const validScenarioVersionIds = new Set();
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    if (s && typeof s === 'object') {
      const vId =
        s.versionId !== undefined ? s.versionId : s.publishedVersionId;
      if (isValidObjectId(vId)) validScenarioVersionIds.add(vId);
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
