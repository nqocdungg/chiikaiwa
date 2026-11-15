import mongoose from 'mongoose';
import { validateSeedDataset } from '../../modules/content/content-validator.js';
import { hashPassword } from '../../modules/identity/crypto.js';
import { sampleDataset } from './sample-content.js';
import { n1Dataset } from './n1-content.js';
import { SEED_ACCOUNT_IDS, SEED_USER_FIXTURES } from './account-fixtures.js';

const { ObjectId } = mongoose.Types;

/**
 * Kiểm tra xem tên cơ sở dữ liệu có phải là môi trường production cần bảo vệ hay không (06 §13.1).
 * @param {string} dbName
 * @returns {boolean}
 */
export function isProtectedDatabase(dbName) {
  if (!dbName || typeof dbName !== 'string') return true;
  const lower = dbName.toLowerCase().trim();

  // Cho phép các database phát triển, thử nghiệm, demo
  if (
    lower.includes('_dev') ||
    lower.includes('_demo') ||
    lower.includes('test') ||
    lower === 'chiikaiwa_dev' ||
    lower === 'chiikaiwa_demo'
  ) {
    return false;
  }

  // Chặn nếu có từ khóa production / prod hoặc các môi trường thật
  if (lower.includes('prod') || lower.includes('production')) {
    return true;
  }

  return false;
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
    const contentId = toObjectId(item.contentId);
    const versionId = toObjectId(item.versionId);
    const revision = typeof item.revision === 'number' ? item.revision : 1;

    const existingVersion = await versionsColl.findOne(
      { _id: versionId },
      { projection: { _id: 1 } },
    );

    if (existingVersion) {
      // Đã có revision này -> Giữ nguyên tính bất biến, chỉ đồng bộ content_items nếu cần
      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            status: 'published',
            publishedVersionId: versionId,
            latestRevision: revision,
            updatedAt: now,
          },
        },
      );
      stats.knowledges.skipped++;
    } else {
      const payload = {
        type: item.type,
        expression: item.expression,
        reading: item.reading,
        meaning: item.meaning,
        examples: item.examples || [],
      };

      await versionsColl.insertOne({
        _id: versionId,
        contentId,
        kind: 'knowledge',
        revision,
        payload,
        publishedAt: now,
        publishedBy: adminId,
      });

      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            kind: 'knowledge',
            status: 'published',
            latestRevision: revision,
            publishedVersionId: versionId,
            draftPayload: payload,
            updatedBy: adminId,
            updatedAt: now,
          },
          $setOnInsert: {
            version: revision,
            createdBy: adminId,
            createdAt: now,
          },
        },
        { upsert: true },
      );
      stats.knowledges.inserted++;
    }
  }

  // 3.2. Nạp questions
  const questions = Array.isArray(dataset.questions) ? dataset.questions : [];
  stats.questions.total = questions.length;
  for (const item of questions) {
    const contentId = toObjectId(item.contentId);
    const versionId = toObjectId(item.versionId);
    const revision = typeof item.revision === 'number' ? item.revision : 1;

    const existingVersion = await versionsColl.findOne(
      { _id: versionId },
      { projection: { _id: 1 } },
    );

    if (existingVersion) {
      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            status: 'published',
            publishedVersionId: versionId,
            latestRevision: revision,
            updatedAt: now,
          },
        },
      );
      stats.questions.skipped++;
    } else {
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

      await versionsColl.insertOne({
        _id: versionId,
        contentId,
        kind: 'question',
        revision,
        payload,
        publishedAt: now,
        publishedBy: adminId,
      });

      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            kind: 'question',
            status: 'published',
            latestRevision: revision,
            publishedVersionId: versionId,
            draftPayload: payload,
            updatedBy: adminId,
            updatedAt: now,
          },
          $setOnInsert: {
            version: revision,
            createdBy: adminId,
            createdAt: now,
          },
        },
        { upsert: true },
      );
      stats.questions.inserted++;
    }
  }

  // 3.3. Nạp scenarios
  const scenarios = Array.isArray(dataset.scenarios) ? dataset.scenarios : [];
  stats.scenarios.total = scenarios.length;
  for (const item of scenarios) {
    const contentId = toObjectId(item.contentId);
    const versionId = toObjectId(item.versionId);
    const revision = typeof item.revision === 'number' ? item.revision : 1;

    const existingVersion = await versionsColl.findOne(
      { _id: versionId },
      { projection: { _id: 1 } },
    );

    if (existingVersion) {
      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            status: 'published',
            publishedVersionId: versionId,
            latestRevision: revision,
            updatedAt: now,
          },
        },
      );
      stats.scenarios.skipped++;
    } else {
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

      await versionsColl.insertOne({
        _id: versionId,
        contentId,
        kind: 'scenario',
        revision,
        payload,
        publishedAt: now,
        publishedBy: adminId,
      });

      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            kind: 'scenario',
            status: 'published',
            latestRevision: revision,
            publishedVersionId: versionId,
            draftPayload: payload,
            updatedBy: adminId,
            updatedAt: now,
          },
          $setOnInsert: {
            version: revision,
            createdBy: adminId,
            createdAt: now,
          },
        },
        { upsert: true },
      );
      stats.scenarios.inserted++;
    }
  }

  // 3.4. Nạp decks
  const decks = Array.isArray(dataset.decks) ? dataset.decks : [];
  stats.decks.total = decks.length;
  for (const item of decks) {
    const contentId = toObjectId(item.contentId);
    const versionId = toObjectId(item.versionId);
    const revision = typeof item.revision === 'number' ? item.revision : 1;

    const existingVersion = await versionsColl.findOne(
      { _id: versionId },
      { projection: { _id: 1 } },
    );

    if (existingVersion) {
      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            status: 'published',
            publishedVersionId: versionId,
            latestRevision: revision,
            level: item.level,
            title: item.title,
            updatedAt: now,
          },
        },
      );
      stats.decks.skipped++;
    } else {
      const payload = {
        title: item.title,
        topicKey: item.topicKey,
        level: item.level,
        description: item.description,
        scenarioVersionIds: toObjectIdArray(item.scenarioVersionIds),
        knowledgeVersionIds: toObjectIdArray(item.knowledgeVersionIds),
        questionVersionIds: toObjectIdArray(item.questionVersionIds),
      };

      await versionsColl.insertOne({
        _id: versionId,
        contentId,
        kind: 'deck',
        revision,
        payload,
        publishedAt: now,
        publishedBy: adminId,
      });

      await itemsColl.updateOne(
        { _id: contentId },
        {
          $set: {
            kind: 'deck',
            status: 'published',
            latestRevision: revision,
            publishedVersionId: versionId,
            level: item.level,
            title: item.title,
            draftPayload: payload,
            updatedBy: adminId,
            updatedAt: now,
          },
          $setOnInsert: {
            version: revision,
            createdBy: adminId,
            createdAt: now,
          },
        },
        { upsert: true },
      );
      stats.decks.inserted++;
    }
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
 * @returns {Promise<{ inserted: number, skipped: number, total: number }>}
 */
export async function seedTestAccountFixtures(db, options = {}) {
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

      if (user.role === 'admin' && customAdminPassword) {
        passwordHash = await hashPassword(customAdminPassword);
      } else if (user.role !== 'admin' && customUserPassword) {
        passwordHash = await hashPassword(customUserPassword);
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
        startedSessions: 1,
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
 * @returns {Promise<{
 *   success: boolean,
 *   datasets: Array<{ datasetName: string, stats: any, errors: string[] }>,
 *   fixtures?: { inserted: number, skipped: number, total: number },
 *   summary: { totalItems: number, totalInserted: number, totalSkipped: number }
 * }>}
 */
export async function seedAll(db, options = {}) {
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
    fixturesResult = await seedTestAccountFixtures(db);
  }

  return {
    success: true,
    datasets: datasetResults,
    fixtures: fixturesResult,
    summary: { totalItems, totalInserted, totalSkipped },
  };
}
