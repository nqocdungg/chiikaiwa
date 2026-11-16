import mongoose from 'mongoose';
import { FIXTURE_USER_IDS } from './auth-fixtures.js';

const { ObjectId } = mongoose.Types;

/**
 * Fixtures kiểm thử cho QA-006: chọn bộ chủ đề, manifest và projection phòng Kaiwa.
 *
 * Phân tách rõ phần contract đã thống nhất và phần đề xuất chờ duyệt (Reviewer: Yến Nhi):
 * - `CONTRACT_DECK_OPTION_PROJECTIONS`: bám sát contract hiện hành tại 07-api-specification.md §6
 *   (`{ id, versionId, title, level, description }`).
 * - `PROPOSED_DECK_OPTION_EXTENSIONS`: đề xuất bổ sung `scenarioCount` (Q1) đang chờ chốt
 *   giữa 02-srs.md (`FR-CAR-01`), 04-ui-ux-design.md (`SC-08`) và 07 §6 / `openapi.yaml`.
 * - Các fixture `published`, `hidden`, `draft`, `empty` dùng ID hex 24 ký tự cố định,
 *   không dùng dữ liệu thật hoặc secret.
 */
export const DECK_SELECTION_FIXTURE_IDS = {
  publishedDeckItem: '667f1f77bcf86cd799439101',
  publishedDeckVersionV1: '767f1f77bcf86cd799439101',
  hiddenDeckItem: '667f1f77bcf86cd799439102',
  hiddenDeckVersionV1: '767f1f77bcf86cd799439102',
  draftDeckItem: '667f1f77bcf86cd799439103',
  emptyDraftDeckItem: '667f1f77bcf86cd799439104',
  scenario1Item: '667f1f77bcf86cd799439111',
  scenario1VersionV1: '767f1f77bcf86cd799439111',
  scenario2Item: '667f1f77bcf86cd799439112',
  scenario2VersionV1: '767f1f77bcf86cd799439112',
  scenarioHiddenDeckItem: '667f1f77bcf86cd799439113',
  scenarioHiddenDeckVersionV1: '767f1f77bcf86cd799439113',
  knowledge1Item: '667f1f77bcf86cd799439121',
  knowledge1VersionV1: '767f1f77bcf86cd799439121',
  question1Item: '667f1f77bcf86cd799439131',
  question1VersionV1: '767f1f77bcf86cd799439131',
  question2Item: '667f1f77bcf86cd799439132',
  question2VersionV1: '767f1f77bcf86cd799439132',
  question3Item: '667f1f77bcf86cd799439133',
  question3VersionV1: '767f1f77bcf86cd799439133',
  sessionSelecting: '967f1f77bcf86cd799439151',
  sessionCard1: '967f1f77bcf86cd799439161',
  sessionCard2: '967f1f77bcf86cd799439162',
};

const ADMIN_OID = new ObjectId(FIXTURE_USER_IDS.admin);
const LEARNER_A_OID = new ObjectId(FIXTURE_USER_IDS.learnerA);
const LEARNER_B_OID = new ObjectId(FIXTURE_USER_IDS.learnerB);
const BASE_TIME = new Date('2026-11-10T08:00:00.000Z');

const sharedKnowledgeVersionId = new ObjectId(
  DECK_SELECTION_FIXTURE_IDS.knowledge1VersionV1,
);
const sharedQuestionVersionIds = [
  new ObjectId(DECK_SELECTION_FIXTURE_IDS.question1VersionV1),
  new ObjectId(DECK_SELECTION_FIXTURE_IDS.question2VersionV1),
  new ObjectId(DECK_SELECTION_FIXTURE_IDS.question3VersionV1),
];

export const DECK_SELECTION_CONTENT_VERSIONS = {
  knowledge1V1: {
    _id: sharedKnowledgeVersionId,
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.knowledge1Item),
    kind: /** @type {const} */ ('knowledge'),
    revision: 1,
    payload: {
      type: /** @type {const} */ ('vocabulary'),
      expression: '打ち合わせ',
      reading: 'うちあわせ',
      meaning: 'Cuộc họp bàn bạc, trao đổi trước',
      examples: [
        {
          japanese: '午後にクライアントと打ち合わせがあります。',
          vietnamese: 'Buổi chiều tôi có cuộc họp trao đổi với khách hàng.',
        },
      ],
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  question1V1: {
    _id: sharedQuestionVersionIds[0],
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.question1Item),
    kind: /** @type {const} */ ('question'),
    revision: 1,
    payload: {
      type: /** @type {const} */ ('multipleChoice'),
      prompt: '「打ち合わせ」の意味として最も適切なものはどれですか。',
      options: [
        { id: 'opt_a', text: '事前の相談や会議' },
        { id: 'opt_b', text: '契約の解約' },
      ],
      correctOptionId: 'opt_a',
      explanation: '「打ち合わせ」は事前に予定や内容を相談することです。',
      knowledgeVersionIds: [sharedKnowledgeVersionId],
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  question2V1: {
    _id: sharedQuestionVersionIds[1],
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.question2Item),
    kind: /** @type {const} */ ('question'),
    revision: 1,
    payload: {
      type: /** @type {const} */ ('shortAnswer'),
      prompt: '「打ち合わせ」のひらがな読みを入力してください。',
      acceptedAnswers: ['うちあわせ'],
      explanation: '「打ち合わせ」は「うちあわせ」と読みます。',
      knowledgeVersionIds: [sharedKnowledgeVersionId],
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  question3V1: {
    _id: sharedQuestionVersionIds[2],
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.question3Item),
    kind: /** @type {const} */ ('question'),
    revision: 1,
    payload: {
      type: /** @type {const} */ ('multipleChoice'),
      prompt: '会議の開始前に確認すべきことは何ですか。',
      options: [
        { id: 'opt_a', text: '議題と時間配分' },
        { id: 'opt_b', text: '個人のパスワード' },
      ],
      correctOptionId: 'opt_a',
      explanation: '会議では議題と時間配分を事前に確認します。',
      knowledgeVersionIds: [sharedKnowledgeVersionId],
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  scenario1V1: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario1VersionV1),
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario1Item),
    kind: /** @type {const} */ ('scenario'),
    revision: 1,
    payload: {
      title: '日程の調整',
      context: '取引先と来週の打ち合わせ日程を電話で調整する。',
      objective: '候補日を2つ提示し、合意した日時を確認する。',
      roleA: '営業担当：来週火曜または木曜の午後を提案してください。',
      roleB: '顧客担当：火曜は不可、木曜15時なら対応可能です。',
      hints: ['ご都合はいかがでしょうか', '木曜日の15時でお願いいたします'],
      knowledgeVersionIds: [sharedKnowledgeVersionId],
      questionVersionIds: sharedQuestionVersionIds,
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  scenario2V1: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario2VersionV1),
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario2Item),
    kind: /** @type {const} */ ('scenario'),
    revision: 1,
    payload: {
      title: '会議の延長確認',
      context: '打ち合わせが予定時刻を過ぎそうなときの確認。',
      objective: '相手が10分延長できるか丁寧に確認する。',
      roleA: '進行役：あと10分ほど延長してもよろしいでしょうか。',
      roleB: '参加者：次の予定があるため5分までなら可能です。',
      hints: ['お時間をいただいてもよろしいでしょうか'],
      knowledgeVersionIds: [sharedKnowledgeVersionId],
      questionVersionIds: sharedQuestionVersionIds,
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  scenarioHiddenDeckV1: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenarioHiddenDeckVersionV1),
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenarioHiddenDeckItem),
    kind: /** @type {const} */ ('scenario'),
    revision: 1,
    payload: {
      title: 'Tình huống thuộc bộ đã ẩn',
      context: 'Bối cảnh của bộ đã bị Admin ẩn khỏi danh sách chọn mới.',
      objective: 'Kiểm tra phiên cũ/nguồn lịch sử vẫn giữ tham chiếu.',
      roleA: 'Vai A của bộ ẩn (không được lộ trong deck-options).',
      roleB: 'Vai B của bộ ẩn (không được lộ cho vai A).',
      hints: ['Gợi ý bộ ẩn'],
      knowledgeVersionIds: [sharedKnowledgeVersionId],
      questionVersionIds: sharedQuestionVersionIds,
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  publishedDeckV1: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.publishedDeckVersionV1),
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.publishedDeckItem),
    kind: /** @type {const} */ ('deck'),
    revision: 1,
    payload: {
      title: 'Giao tiếp công sở N3',
      topicKey: 'office_communication_n3',
      level: 'N3',
      description: 'Luyện đặt lịch và trao đổi công việc cơ bản.',
      scenarioVersionIds: [
        new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario1VersionV1),
        new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario2VersionV1),
      ],
      knowledgeVersionIds: [sharedKnowledgeVersionId],
      questionVersionIds: sharedQuestionVersionIds,
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },

  hiddenDeckV1: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.hiddenDeckVersionV1),
    contentId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.hiddenDeckItem),
    kind: /** @type {const} */ ('deck'),
    revision: 1,
    payload: {
      title: 'Bộ chủ đề đã ẩn N2',
      topicKey: 'hidden_business_n2',
      level: 'N2',
      description: 'Bộ đã xuất bản trước đó nhưng hiện đang bị ẩn.',
      scenarioVersionIds: [
        new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenarioHiddenDeckVersionV1),
      ],
      knowledgeVersionIds: [sharedKnowledgeVersionId],
      questionVersionIds: sharedQuestionVersionIds,
    },
    publishedAt: BASE_TIME,
    publishedBy: ADMIN_OID,
    createdAt: BASE_TIME,
  },
};

export const DECK_SELECTION_CONTENT_ITEMS = {
  /** Bộ đã xuất bản (kèm draftPayload mới chưa xuất bản để kiểm tra không rò rỉ nháp). */
  publishedDeck: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.publishedDeckItem),
    kind: /** @type {const} */ ('deck'),
    status: /** @type {const} */ ('published'),
    level: 'N3',
    title: 'Giao tiếp công sở N3',
    publishedVersionId: new ObjectId(
      DECK_SELECTION_FIXTURE_IDS.publishedDeckVersionV1,
    ),
    latestRevision: 1,
    version: 1,
    draftPayload: {
      title: 'Giao tiếp công sở N3 (Bản nháp chưa xuất bản)',
      topicKey: 'office_communication_n3',
      level: 'N3',
      description: 'DRAFT_LEAK_GUARD: Mô tả nháp không được lộ cho learner.',
      scenarioVersionIds: [
        new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario1VersionV1),
        new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario2VersionV1),
      ],
      knowledgeVersionIds: [sharedKnowledgeVersionId],
      questionVersionIds: sharedQuestionVersionIds,
    },
    createdBy: ADMIN_OID,
    updatedBy: ADMIN_OID,
    createdAt: new Date('2026-11-10T08:05:00.000Z'),
    updatedAt: new Date('2026-11-10T08:05:00.000Z'),
  },

  /** Bộ đã ẩn: giữ publishedVersionId cho lịch sử/nguồn, nhưng cấm xuất hiện khi chọn mới. */
  hiddenDeck: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.hiddenDeckItem),
    kind: /** @type {const} */ ('deck'),
    status: /** @type {const} */ ('hidden'),
    level: 'N2',
    title: 'Bộ chủ đề đã ẩn N2',
    publishedVersionId: new ObjectId(
      DECK_SELECTION_FIXTURE_IDS.hiddenDeckVersionV1,
    ),
    latestRevision: 1,
    version: 2,
    createdBy: ADMIN_OID,
    updatedBy: ADMIN_OID,
    createdAt: new Date('2026-11-10T08:04:00.000Z'),
    updatedAt: new Date('2026-11-10T08:04:00.000Z'),
  },

  /** Bộ nháp có tình huống nhưng chưa từng xuất bản. */
  draftDeck: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.draftDeckItem),
    kind: /** @type {const} */ ('deck'),
    status: /** @type {const} */ ('draft'),
    level: 'N4',
    title: 'Bộ nháp N4 chưa xuất bản',
    publishedVersionId: null,
    latestRevision: 0,
    version: 0,
    draftPayload: {
      title: 'Bộ nháp N4 chưa xuất bản',
      topicKey: 'draft_topic_n4',
      level: 'N4',
      description: 'DRAFT_LEAK_GUARD: Không được xuất hiện ở deck-options.',
      scenarioVersionIds: [
        new ObjectId(DECK_SELECTION_FIXTURE_IDS.scenario1VersionV1),
      ],
      knowledgeVersionIds: [],
      questionVersionIds: [],
    },
    createdBy: ADMIN_OID,
    updatedBy: ADMIN_OID,
    createdAt: new Date('2026-11-10T08:03:00.000Z'),
    updatedAt: new Date('2026-11-10T08:03:00.000Z'),
  },

  /** Bộ nháp rỗng (0 tình huống): không thể xuất bản (422 CONTENT_INCOMPLETE / THRESHOLD_NOT_MET). */
  emptyDraftDeck: {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.emptyDraftDeckItem),
    kind: /** @type {const} */ ('deck'),
    status: /** @type {const} */ ('draft'),
    level: 'N5',
    title: 'Bộ nháp rỗng N5',
    publishedVersionId: null,
    latestRevision: 0,
    version: 0,
    draftPayload: {
      title: 'Bộ nháp rỗng N5',
      topicKey: 'empty_draft_n5',
      level: 'N5',
      description: 'Không có tình huống nào.',
      scenarioVersionIds: [],
      knowledgeVersionIds: [],
      questionVersionIds: [],
    },
    createdBy: ADMIN_OID,
    updatedBy: ADMIN_OID,
    createdAt: new Date('2026-11-10T08:02:00.000Z'),
    updatedAt: new Date('2026-11-10T08:02:00.000Z'),
  },
};

/**
 * Phiên active đang ở giai đoạn chọn bộ (cả hai đã kết nối, còn 60s, chưa chọn bộ).
 *
 * @param {Date} [at]
 */
export function createSelectingSessionFixture(at = BASE_TIME) {
  return {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.sessionSelecting),
    originKind: /** @type {const} */ ('match'),
    originId: new ObjectId('867f1f77bcf86cd799439151'),
    roomName: `session-${DECK_SELECTION_FIXTURE_IDS.sessionSelecting}`,
    status: /** @type {const} */ ('active'),
    version: 2,
    members: [
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        kind: /** @type {const} */ ('user'),
        userId: LEARNER_A_OID,
      },
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerB}`,
        kind: /** @type {const} */ ('user'),
        userId: LEARNER_B_OID,
      },
    ],
    controllerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
    startedAt: at,
    activeDurationMs: 0,
    activeSince: at,
    selectionRemainingMs: 60_000,
    selectionRunningSince: at,
    presence: [
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        connected: true,
        lastEventAt: at,
      },
      {
        actorKey: `user:${FIXTURE_USER_IDS.learnerB}`,
        connected: true,
        lastEventAt: at,
      },
    ],
    screenShare: { state: /** @type {const} */ ('idle'), version: 0 },
    mediaCleanup: { state: /** @type {const} */ ('none'), attempts: 0 },
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Hai lá úp mẫu sau khi chọn `publishedDeckV1` (dùng để kiểm tra projection không lộ
 * `scenarioVersionId`, nội dung tình huống chưa bốc hoặc vai đối tác).
 */
export const SESSION_FACE_DOWN_CARDS_FIXTURE = [
  {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.sessionCard1),
    sessionId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.sessionSelecting),
    scenarioVersionId: new ObjectId(
      DECK_SELECTION_FIXTURE_IDS.scenario1VersionV1,
    ),
    slot: 0,
    status: /** @type {const} */ ('faceDown'),
  },
  {
    _id: new ObjectId(DECK_SELECTION_FIXTURE_IDS.sessionCard2),
    sessionId: new ObjectId(DECK_SELECTION_FIXTURE_IDS.sessionSelecting),
    scenarioVersionId: new ObjectId(
      DECK_SELECTION_FIXTURE_IDS.scenario2VersionV1,
    ),
    slot: 1,
    status: /** @type {const} */ ('faceDown'),
  },
];

/**
 * Kỳ vọng projection cho `GET /sessions/:id/deck-options` theo contract hiện hành tại 07 §6
 * (không bao gồm các trường đề xuất chưa chốt như `scenarioCount`).
 */
export const CONTRACT_DECK_OPTION_PROJECTIONS = {
  /** Khi DB có cả published, hidden, draft, emptyDraft -> chỉ trả đúng bộ published. */
  withMixedCatalog: {
    items: [
      {
        id: DECK_SELECTION_FIXTURE_IDS.publishedDeckItem,
        versionId: DECK_SELECTION_FIXTURE_IDS.publishedDeckVersionV1,
        title: 'Giao tiếp công sở N3',
        level: 'N3',
        description: 'Luyện đặt lịch và trao đổi công việc cơ bản.',
      },
    ],
    nextCursor: null,
  },

  /** Khi DB không có bộ published nào (chỉ có hidden/draft/empty hoặc rỗng hoàn toàn). */
  emptyCatalog: {
    items: [],
    nextCursor: null,
  },
};

/**
 * Phần đề xuất mở rộng chờ reviewer Yến Nhi và nhóm chốt contract (chưa phải contract chính thức).
 * Xem QA-006 Q1: đồng bộ `scenarioCount` từ `FR-CAR-01` / `SC-08` vào `07 §6` và `openapi.yaml`.
 */
export const PROPOSED_DECK_OPTION_EXTENSIONS = {
  publishedDeckScenarioCount: 2,
};

/**
 * Các trường bị cấm tuyệt đối trong response `deck-options` và `Session.slots` (06 §12.1, 07 §3).
 */
export const FORBIDDEN_PROJECTION_FIELDS = {
  deckOption: [
    'draftPayload',
    'scenarioVersionIds',
    'knowledgeVersionIds',
    'questionVersionIds',
    'roleA',
    'roleB',
    'correctOptionId',
    'acceptedAnswers',
    'explanation',
  ],
  faceDownSlot: [
    'scenarioVersionId',
    'title',
    'context',
    'objective',
    'roleA',
    'roleB',
    'myRole',
    'hints',
  ],
};
