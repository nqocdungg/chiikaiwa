import mongoose from 'mongoose';
import { validateSeedDataset } from '../../modules/content/content-validator.js';
import { hashPassword } from '../../modules/identity/crypto.js';
import { sampleDataset } from './sample-content.js';
import { n1Dataset } from './n1-content.js';
import { SEED_ACCOUNT_IDS, SEED_USER_FIXTURES } from './account-fixtures.js';

const { ObjectId } = mongoose.Types;

/**
 * Kiểm tra xem tên cơ sở dữ liệu có phải là môi trường production cần bảo vệ hay không (06 §13.1).
 * Áp dụng whitelist chặt chẽ (fail-closed): Chỉ cho phép các database có hậu tố/tiền tố dev, demo, test.
 * Mọi database không thuộc danh sách này đều bị coi là môi trường cần bảo vệ.
 *
 * @param {string} dbName
 * @returns {boolean}
 */
export function isProtectedDatabase(dbName) {
  if (!dbName || typeof dbName !== 'string') return true;
  const lower = dbName.toLowerCase().trim();

  // Whitelist: Chỉ cho phép các database có định danh dev, demo, test rõ ràng (fail-closed)
  const isDev =
    lower === 'chiikaiwa_dev' ||
    lower.endsWith('_dev') ||
    lower.startsWith('dev_') ||
    lower.includes('_dev_');
  const isDemo =
    lower === 'chiikaiwa_demo' ||
    lower.endsWith('_demo') ||
    lower.startsWith('demo_') ||
    lower.includes('_demo_');
  const isTest =
    lower.includes('test') ||
    lower.endsWith('_test') ||
    lower.startsWith('test_');

  if (isDev || isDemo || isTest) {
    return false;
  }

  // Mọi database không thuộc whitelist đều bị coi là protected (fail-closed)
  return true;
}

/**
 * Kiểm tra guard bảo vệ database ngay trong module seed (fail-closed, 06 §13.1).
 * @param {import('mongoose').mongo.Db} db
 * @param {object} [options]
 * @param {boolean} [options.forceProduction]
 */
export function assertDatabaseNotProtected(db, options = {}) {
  const dbName = db?.databaseName;
  if (isProtectedDatabase(dbName) && !options.forceProduction) {
    throw new Error(
      `[seed] LỖI BẢO MẬT: Cơ sở dữ liệu '${dbName}' không thuộc whitelist dev/demo/test (fail-closed). Thao tác seed bị chặn (06 §13.1). Chỉ định forceProduction=true nếu thực sự cần ghi đè.`,
    );
  }
}

/**
 * Chuyển đổi định danh sang ObjectId an toàn.
 * @param {unknown} id
 * @returns {import('mongoose').Types.ObjectId}
 */
function toObjectId(id) {
  if (id instanceof ObjectId) return id;
  return new ObjectId(String(id));
}

/**
 * Chuyển đổi mảng định danh sang ObjectId[] an toàn.
 * @param {unknown} ids
 * @returns {import('mongoose').Types.ObjectId[]}
 */
function toObjectIdArray(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map(toObjectId);
}

/**
 * Nạp hoặc cập nhật an toàn một mục học liệu và version tương ứng (DATA-002, 06 §13.1).
 * Đảm bảo:
 * 1. Tính bất biến: Không ghi đè content_versions đã có.
 * 2. Phục hồi lỗi phân đoạn (partial failure): Nếu version đã có nhưng content_items bị thiếu, khôi phục lại content_items.
 * 3. Bảo toàn nghiệp vụ: Không ghi đè latestRevision, publishedVersionId, status khi DB đã có revision mới hơn hoặc Admin đã ẩn học liệu.
 *
 * @param {object} params
 * @param {import('mongoose').mongo.Collection} params.itemsColl
 * @param {import('mongoose').mongo.Collection} params.versionsColl
 * @param {any} params.item
 * @param {'knowledge' | 'question' | 'scenario' | 'deck'} params.kind
 * @param {Record<string, any>} params.payload
 * @param {import('mongoose').Types.ObjectId} params.adminId
 * @param {Date} params.now
 * @param {Record<string, any>} [params.extraItemFields]
 * @returns {Promise<{ inserted: boolean, skipped: boolean }>}
 */
async function upsertContentItemAndVersion({
  itemsColl,
  versionsColl,
  item,
  kind,
  payload,
  adminId,
  now,
  extraItemFields = {},
}) {
  const contentId = toObjectId(item.contentId);
  const versionId = toObjectId(item.versionId);
  const revision = typeof item.revision === 'number' ? item.revision : 1;

  // 1. Kiểm tra version trong content_versions
  const existingVersion = await versionsColl.findOne(
    { _id: versionId },
    { projection: { _id: 1 } },
  );

  let versionInserted = false;
  if (!existingVersion) {
    await versionsColl.insertOne({
      _id: versionId,
      contentId,
      kind,
      revision,
      payload,
      publishedAt: now,
      publishedBy: adminId,
    });
    versionInserted = true;
  }

  // 2. Kiểm tra và đồng bộ content_items (xử lý cả partial failure recovery và quy tắc revision/hide)
  const existingItem = await itemsColl.findOne({ _id: contentId });

  if (!existingItem) {
    // Trường hợp content_items chưa tồn tại (chạy lần đầu hoặc khôi phục sau partial failure)
    await itemsColl.updateOne(
      { _id: contentId },
      {
        $set: {
          kind,
          status: 'published',
          latestRevision: revision,
          publishedVersionId: versionId,
          draftPayload: payload,
          updatedBy: adminId,
          updatedAt: now,
          ...extraItemFields,
        },
        $setOnInsert: {
          version: revision,
          createdBy: adminId,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  } else {
    // Trường hợp content_items đã tồn tại:
    // Tuân thủ quy tắc: Không ghi đè latestRevision, publishedVersionId, status khi DB đã có revision mới hơn hoặc Admin đã ẩn học liệu.
    const hasNewerRevision =
      typeof existingItem.latestRevision === 'number' &&
      existingItem.latestRevision > revision;
    const isHidden = existingItem.status === 'hidden';

    /** @type {Record<string, any>} */
    const updateSet = {
      updatedAt: now,
    };

    if (!isHidden) {
      updateSet.status = 'published';
    }

    if (!hasNewerRevision) {
      updateSet.latestRevision = revision;
      updateSet.publishedVersionId = versionId;
      updateSet.draftPayload = payload;
      if (extraItemFields && Object.keys(extraItemFields).length > 0) {
        Object.assign(updateSet, extraItemFields);
      }
    }

    await itemsColl.updateOne({ _id: contentId }, { $set: updateSet });
  }

  return {
    inserted: versionInserted,
    skipped: !versionInserted,
  };
}

/**
 * Nạp một bộ dữ liệu học liệu vào cơ sở dữ liệu một cách idempotent (DATA-002, 06 §13.1).
 * Tuân thủ nghiêm ngặt:
 * 1. Pre-validation toàn diện trước khi ghi.
 * 2. Thứ tự seed: knowledges -> questions -> scenarios -> decks.
 * 3. Bảo toàn tính bất biến của content_versions: không ghi đè revision đã có.
 * 4. Đồng bộ con trỏ và trạng thái xuất bản trong content_items.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {Record<string, any>} dataset - Gói dữ liệu chứa knowledges, questions, scenarios, decks
 * @param {object} [options]
 * @param {string} [options.datasetName]
 * @param {import('mongoose').Types.ObjectId} [options.adminId]
 * @param {Date} [options.now]
 * @param {boolean} [options.forceProduction]
 * @returns {Promise<{
 *   success: boolean,
 *   datasetName: string,
 *   stats: {
 *     knowledges: { total: number, inserted: number, skipped: number },
 *     questions: { total: number, inserted: number, skipped: number },
 *     scenarios: { total: number, inserted: number, skipped: number },
 *     decks: { total: number, inserted: number, skipped: number },
 *   },
 *   errors: string[]
 * }>}
 */
export async function seedContentDataset(db, dataset, options = {}) {
  assertDatabaseNotProtected(db, options);

  const datasetName = options.datasetName || 'unnamed';
  const stats = {
    knowledges: { total: 0, inserted: 0, skipped: 0 },
    questions: { total: 0, inserted: 0, skipped: 0 },
    scenarios: { total: 0, inserted: 0, skipped: 0 },
    decks: { total: 0, inserted: 0, skipped: 0 },
  };

  // 1. Validate dataset theo schema thống nhất trước khi ghi bất kỳ dữ liệu nào (AC 1)
  const validation = validateSeedDataset(dataset);
  if (!validation.isValid) {
    return {
      success: false,
      datasetName,
      stats,
      errors: validation.errors,
    };
  }

  // 2. Xác định admin ID chịu trách nhiệm xuất bản
  let adminId = options.adminId;
  if (!adminId) {
    const adminUser = await db
      .collection('users')
      .findOne({ role: 'admin' }, { projection: { _id: 1 } });
    adminId = adminUser ? adminUser._id : new ObjectId(SEED_ACCOUNT_IDS.admin);
  }

  const itemsColl = db.collection('content_items');
  const versionsColl = db.collection('content_versions');
  const now = options.now || new Date();

  // 3. Thứ tự nạp: knowledges -> questions -> scenarios -> decks (06 §13.1)

  // 3.1. Nạp knowledges
  const knowledges = Array.isArray(dataset.knowledges)
    ? dataset.knowledges
    : [];
  stats.knowledges.total = knowledges.length;
  for (const item of knowledges) {
    const payload = {
      type: item.type,
      expression: item.expression,
      reading: item.reading,
      meaning: item.meaning,
      examples: item.examples || [],
    };

    const res = await upsertContentItemAndVersion({
      itemsColl,
      versionsColl,
      item,
      kind: 'knowledge',
      payload,
      adminId,
      now,
    });
    if (res.inserted) stats.knowledges.inserted++;
    else stats.knowledges.skipped++;
  }

  // 3.2. Nạp questions
  const questions = Array.isArray(dataset.questions) ? dataset.questions : [];
  stats.questions.total = questions.length;
  for (const item of questions) {
    /** @type {Record<string, any>} */
    const payload = {
      type: item.type,
      prompt: item.prompt,
      explanation: item.explanation,
      knowledgeVersionIds: toObjectIdArray(item.knowledgeVersionIds),
    };
    if (item.options !== undefined) payload.options = item.options;
    if (item.correctOptionId !== undefined) {
      payload.correctOptionId = item.correctOptionId;
    }
    if (item.acceptedAnswers !== undefined) {
      payload.acceptedAnswers = item.acceptedAnswers;
    }

    const res = await upsertContentItemAndVersion({
      itemsColl,
      versionsColl,
      item,
      kind: 'question',
      payload,
      adminId,
      now,
    });
    if (res.inserted) stats.questions.inserted++;
    else stats.questions.skipped++;
  }

  // 3.3. Nạp scenarios
  const scenarios = Array.isArray(dataset.scenarios) ? dataset.scenarios : [];
  stats.scenarios.total = scenarios.length;
  for (const item of scenarios) {
    const payload = {
      title: item.title,
      context: item.context,
      objective: item.objective,
      roleA: item.roleA,
      roleB: item.roleB,
      hints: item.hints || [],
      knowledgeVersionIds: toObjectIdArray(item.knowledgeVersionIds),
      questionVersionIds: toObjectIdArray(item.questionVersionIds),
    };

    const res = await upsertContentItemAndVersion({
      itemsColl,
      versionsColl,
      item,
      kind: 'scenario',
      payload,
      adminId,
      now,
    });
    if (res.inserted) stats.scenarios.inserted++;
    else stats.scenarios.skipped++;
  }

  // 3.4. Nạp decks
  const decks = Array.isArray(dataset.decks) ? dataset.decks : [];
  stats.decks.total = decks.length;
  for (const item of decks) {
    const payload = {
      title: item.title,
      topicKey: item.topicKey,
      level: item.level,
      description: item.description,
      scenarioVersionIds: toObjectIdArray(item.scenarioVersionIds),
      knowledgeVersionIds: toObjectIdArray(item.knowledgeVersionIds),
      questionVersionIds: toObjectIdArray(item.questionVersionIds),
    };

    const extraItemFields = {
      level: item.level,
      title: item.title,
    };

    const res = await upsertContentItemAndVersion({
      itemsColl,
      versionsColl,
      item,
      kind: 'deck',
      payload,
      adminId,
      now,
      extraItemFields,
    });
    if (res.inserted) stats.decks.inserted++;
    else stats.decks.skipped++;
  }

  return {
    success: true,
    datasetName,
    stats,
    errors: [],
  };
}

/**
 * Nạp các tài khoản kiểm thử và demo baseline theo chuẩn 02 §11.1 một cách idempotent.
 * Không ghi đè mật khẩu của tài khoản đã tồn tại.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {object} [options]
 * @param {Date} [options.now]
 * @param {string} [options.adminPassword]
 * @param {string} [options.userPassword]
 * @param {boolean} [options.forceProduction]
 * @returns {Promise<{ inserted: number, skipped: number, total: number }>}
 */
export async function seedTestAccountFixtures(db, options = {}) {
  assertDatabaseNotProtected(db, options);

  const usersColl = db.collection('users');
  const actorStatesColl = db.collection('actor_states');
  const statsColl = db.collection('statistics');
  const now = options.now || new Date();

  let inserted = 0;
  let skipped = 0;

  for (const user of SEED_USER_FIXTURES) {
    const existing = await usersColl.findOne(
      { emailKey: user.emailKey },
      { projection: { _id: 1 } },
    );

    if (existing) {
      skipped++;
    } else {
      let passwordHash = user.passwordHash;
      const customAdminPassword =
        options.adminPassword || process.env.SEED_ADMIN_PASSWORD;
      const customUserPassword =
        options.userPassword || process.env.SEED_USER_PASSWORD;

      if (user.role === 'admin') {
        if (
          !customAdminPassword ||
          typeof customAdminPassword !== 'string' ||
          !customAdminPassword.trim()
        ) {
          throw new Error(
            '[seed] Bắt buộc cung cấp biến môi trường SEED_ADMIN_PASSWORD để khởi tạo tài khoản Admin (06 §13.1). Tuyệt đối không dùng mật khẩu mặc định.',
          );
        }
        passwordHash = await hashPassword(customAdminPassword.trim());
      } else if (customUserPassword) {
        passwordHash = await hashPassword(customUserPassword.trim());
      }

      await usersColl.insertOne({
        ...user,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      // Tạo actor_state tương ứng
      await actorStatesColl.updateOne(
        /** @type {any} */ ({ _id: `user:${user._id.toHexString()}` }),
        {
          $setOnInsert: {
            mode: 'idle',
            version: 0,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );

      inserted++;
    }
  }

  // Khởi tạo lifetime statistics baseline (06 §11.1) nếu chưa có
  await statsColl.updateOne(
    /** @type {any} */ ({ _id: 'lifetime' }),
    {
      $setOnInsert: {
        registeredAccounts: SEED_USER_FIXTURES.length,
        startedSessions: 0,
        reviewCount: 0,
        submittedQuizCount: 0,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  return {
    total: SEED_USER_FIXTURES.length,
    inserted,
    skipped,
  };
}

/**
 * Danh mục các dataset học liệu có sẵn trong hệ thống.
 * @type {Record<string, any>}
 */
export const AVAILABLE_DATASETS = {
  sample: sampleDataset,
  n1: n1Dataset,
};

/**
 * Hàm điều phối nạp toàn bộ học liệu và fixtures (DATA-002).
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {object} [options]
 * @param {boolean} [options.includeFixtures=true]
 * @param {string[]} [options.datasets] - Danh sách tên dataset cần nạp (['sample', 'n1'])
 * @param {boolean} [options.forceProduction]
 * @param {string} [options.adminPassword]
 * @param {string} [options.userPassword]
 * @returns {Promise<{
 *   success: boolean,
 *   datasets: Array<{ datasetName: string, stats: any, errors: string[] }>,
 *   fixtures?: { inserted: number, skipped: number, total: number },
 *   summary: { totalItems: number, totalInserted: number, totalSkipped: number }
 * }>}
 */
export async function seedAll(db, options = {}) {
  assertDatabaseNotProtected(db, options);

  const datasetKeys = options.datasets || Object.keys(AVAILABLE_DATASETS);
  const includeFixtures = options.includeFixtures !== false;

  let totalItems = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  const datasetResults = [];

  for (const key of datasetKeys) {
    const dataset = AVAILABLE_DATASETS[key];
    if (!dataset) {
      throw new Error(`Không tìm thấy dataset với tên '${key}'.`);
    }

    const res = await seedContentDataset(db, dataset, {
      datasetName: key,
      now: new Date(),
      forceProduction: options.forceProduction,
    });

    if (!res.success) {
      return {
        success: false,
        datasets: [...datasetResults, res],
        summary: { totalItems, totalInserted, totalSkipped },
      };
    }

    const groupKeys = /** @type {const} */ ([
      'knowledges',
      'questions',
      'scenarios',
      'decks',
    ]);
    for (const g of groupKeys) {
      totalItems += res.stats[g].total;
      totalInserted += res.stats[g].inserted;
      totalSkipped += res.stats[g].skipped;
    }

    datasetResults.push(res);
  }

  let fixturesResult;
  if (includeFixtures) {
    fixturesResult = await seedTestAccountFixtures(db, {
      adminPassword: options.adminPassword,
      userPassword: options.userPassword,
      forceProduction: options.forceProduction,
    });
  }

  return {
    success: true,
    datasets: datasetResults,
    fixtures: fixturesResult,
    summary: { totalItems, totalInserted, totalSkipped },
  };
}
