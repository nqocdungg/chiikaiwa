import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { validateSeedDataset } from '../../modules/content/content-validator.js';
import { hashPassword } from '../../modules/identity/crypto.js';
import { sampleDataset } from './sample-content.js';
import { n1Dataset } from './n1-content.js';
import { SEED_ACCOUNT_IDS, SEED_USER_FIXTURES } from './account-fixtures.js';

const { ObjectId } = mongoose.Types;

const SAFE_DATABASE_SEGMENT_PATTERN = /(^|_)(dev|demo|test)(_|$)/u;
const FORBIDDEN_DATABASE_SEGMENT_PATTERN = /(^|_)(prod|production|live)(_|$)/u;
const MAX_ITEM_SYNC_ATTEMPTS = 3;

/**
 * Khởi tạo bảng thống kê rỗng cho các nhóm học liệu.
 */
function createEmptyStats() {
  return {
    knowledges: { total: 0, inserted: 0, synced: 0, skipped: 0 },
    questions: { total: 0, inserted: 0, synced: 0, skipped: 0 },
    scenarios: { total: 0, inserted: 0, synced: 0, skipped: 0 },
    decks: { total: 0, inserted: 0, synced: 0, skipped: 0 },
  };
}

/**
 * Kiểm tra xem tên cơ sở dữ liệu có phải là môi trường production cần bảo vệ hay không (06 §13.1).
 * Áp dụng whitelist chặt chẽ (fail-closed): Chỉ cho phép các database có segment dev, demo, test rõ ràng
 * và không chứa segment cấm prod, production, live.
 * Mọi database không thuộc danh sách này đều bị coi là môi trường cần bảo vệ.
 *
 * @param {string} dbName
 * @returns {boolean}
 */
export function isProtectedDatabase(dbName) {
  if (!dbName || typeof dbName !== 'string') return true;
  const lower = dbName.toLowerCase().trim();
  if (FORBIDDEN_DATABASE_SEGMENT_PATTERN.test(lower)) return true;
  return !SAFE_DATABASE_SEGMENT_PATTERN.test(lower);
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
 * Chuẩn hóa và kiểm tra độ dài tối thiểu của mật khẩu seed (06 §13.1, .env.example).
 *
 * @param {unknown} value
 * @param {string} envName
 * @returns {string}
 */
function normalizeSeedPassword(value, envName) {
  if (typeof value !== 'string') {
    throw new Error(
      `[seed] Biến '${envName}' không hợp lệ hoặc thiếu giá trị chuỗi.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    throw new Error(
      `[seed] Biến '${envName}' bắt buộc có độ dài tối thiểu 8 ký tự (nhận được ${trimmed.length} ký tự).`,
    );
  }
  return trimmed;
}

/**
 * Nạp phiên bản và đồng bộ bản ghi mục cha content_items theo quy tắc idempotency và revision guard (DATA-002, 06 §13.1).
 * Áp dụng CAS (Compare-And-Swap) với tối đa 3 lần thử nhằm chống race condition khi Admin publish đồng thời.
 * Bảo toàn draftPayload của Admin (chỉ gán khi tạo mới hoặc khôi phục qua $setOnInsert).
 * Bảo toàn tính bất biến của revision: phát hiện và ném lỗi rõ ràng nếu revision đã tồn tại với versionId khác.
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
 * @returns {Promise<{
 *   inserted: boolean,
 *   synced: boolean,
 *   skipped: boolean,
 *   record: {
 *     contentId: string,
 *     versionId: string,
 *     kind: string,
 *     revision: number,
 *     action: 'inserted' | 'recovered' | 'pointer_synced' | 'preserved' | 'unchanged',
 *     versionInserted: boolean
 *   }
 * }>}
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

  // 1. Kiểm tra tính bất biến của revision (06 §13.1.5: không sửa đè revision đã dùng)
  const existingByRevision = await versionsColl.findOne(
    { contentId, revision },
    { projection: { _id: 1 } },
  );
  if (existingByRevision?._id) {
    const existingVerIdStr =
      typeof existingByRevision._id?.toHexString === 'function'
        ? existingByRevision._id.toHexString()
        : String(existingByRevision._id);
    if (existingVerIdStr !== versionId.toHexString()) {
      throw new Error(
        `[seed] Xung đột revision: contentId '${contentId.toHexString()}' revision ${revision} đã tồn tại với versionId '${existingVerIdStr}' khác với seed versionId '${versionId.toHexString()}'. Tuân thủ tính bất biến 06 §13.1.5: không sửa đè revision đã dùng.`,
      );
    }
  }

  const existingVersion = await versionsColl.findOne(
    { _id: versionId },
    { projection: { _id: 1 } },
  );

  let versionInserted = false;
  if (!existingVersion) {
    try {
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
    } catch (err) {
      if (/** @type {any} */ (err)?.code !== 11000) throw err;
      // Trùng 11000: Kiểm tra xem có đúng là tiến trình seed khác vừa insert version này không
      const again = await versionsColl.findOne(
        { _id: versionId },
        { projection: { _id: 1 } },
      );
      if (!again) {
        // Trùng (contentId, revision) với versionId khác -> lỗi vi phạm tính bất biến thật
        throw err;
      }
      versionInserted = false;
    }
  }

  let action =
    /** @type {'inserted' | 'recovered' | 'pointer_synced' | 'preserved' | 'unchanged'} */ (
      'unchanged'
    );
  let settled = false;

  for (let attempt = 0; attempt < MAX_ITEM_SYNC_ATTEMPTS; attempt++) {
    const existingItem = await itemsColl.findOne({ _id: contentId });

    if (!existingItem) {
      try {
        await itemsColl.updateOne(
          { _id: contentId },
          {
            $setOnInsert: {
              kind,
              status: 'published',
              latestRevision: revision,
              publishedVersionId: versionId,
              draftPayload: payload,
              updatedBy: adminId,
              updatedAt: now,
              version: 0,
              createdBy: adminId,
              createdAt: now,
              ...extraItemFields,
            },
          },
          { upsert: true },
        );
        action = versionInserted ? 'inserted' : 'recovered';
        settled = true;
        break;
      } catch (err) {
        if (/** @type {any} */ (err)?.code === 11000) {
          // Race condition: Tiến trình song song vừa insert xong item, tiếp tục vòng lặp CAS để đọc lại
          continue;
        }
        throw err;
      }
    }

    const hasNewerRevision =
      typeof existingItem.latestRevision === 'number' &&
      existingItem.latestRevision > revision;
    const isHidden = existingItem.status === 'hidden';

    /** @type {Record<string, any>} */
    const updateSet = {};

    if (!isHidden && existingItem.status !== 'published') {
      updateSet.status = 'published';
    }

    if (!hasNewerRevision) {
      if (existingItem.latestRevision !== revision) {
        updateSet.latestRevision = revision;
      }
      if (String(existingItem.publishedVersionId) !== String(versionId)) {
        updateSet.publishedVersionId = versionId;
      }
    }

    if (Object.keys(updateSet).length === 0) {
      if (hasNewerRevision || isHidden) {
        action = 'preserved';
      } else {
        action = 'unchanged';
      }
      settled = true;
      break;
    }

    updateSet.updatedAt = now;

    /** @type {Record<string, any>} */
    const casFilter = {
      _id: contentId,
      latestRevision: existingItem.latestRevision,
      status: existingItem.status,
      version:
        typeof existingItem.version === 'number'
          ? existingItem.version
          : { $exists: false },
    };

    const updateResult = await itemsColl.updateOne(casFilter, {
      $set: updateSet,
      $inc: { version: 1 },
    });

    if (updateResult.matchedCount === 1) {
      action = 'pointer_synced';
      settled = true;
      break;
    }
  }

  if (!settled) {
    throw new Error(
      `[seed] Không đồng bộ được content_items '${contentId.toHexString()}' do bị thay đổi đồng thời sau ${MAX_ITEM_SYNC_ATTEMPTS} lần thử. Hãy chạy lại seed.`,
    );
  }

  const isSynced =
    !versionInserted && (action === 'recovered' || action === 'pointer_synced');
  const isSkipped =
    !versionInserted && (action === 'preserved' || action === 'unchanged');

  return {
    inserted: versionInserted,
    synced: isSynced,
    skipped: isSkipped,
    record: {
      contentId: contentId.toHexString(),
      versionId: versionId.toHexString(),
      kind,
      revision,
      action,
      versionInserted,
    },
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
 * @param {boolean} [options.warnOnMissingAdmin=true]
 * @returns {Promise<{
 *   success: boolean,
 *   datasetName: string,
 *   stats: {
 *     knowledges: { total: number, inserted: number, synced: number, skipped: number },
 *     questions: { total: number, inserted: number, synced: number, skipped: number },
 *     scenarios: { total: number, inserted: number, synced: number, skipped: number },
 *     decks: { total: number, inserted: number, synced: number, skipped: number },
 *   },
 *   records: Array<{
 *     contentId: string,
 *     versionId: string,
 *     kind: string,
 *     revision: number,
 *     action: 'inserted' | 'recovered' | 'pointer_synced' | 'preserved' | 'unchanged',
 *     versionInserted: boolean
 *   }>,
 *   errors: Array<{ contentId?: string, kind?: string, revision?: number, message: string }>
 * }>}
 */
export async function seedContentDataset(db, dataset, options = {}) {
  assertDatabaseNotProtected(db, options);

  const datasetName = options.datasetName || 'unnamed';
  const stats = createEmptyStats();

  // 1. Validate dataset theo schema thống nhất trước khi ghi bất kỳ dữ liệu nào (AC 1)
  const validation = validateSeedDataset(dataset);
  if (!validation.isValid) {
    return {
      success: false,
      datasetName,
      stats,
      records: [],
      errors: validation.errors.map((msg) => ({ message: msg })),
    };
  }

  // 2. Xác định admin ID chịu trách nhiệm xuất bản
  let adminId = options.adminId;
  if (!adminId) {
    const adminUser = await db
      .collection('users')
      .findOne({ role: 'admin' }, { projection: { _id: 1 } });
    if (adminUser) {
      adminId = adminUser._id;
    } else {
      if (options.warnOnMissingAdmin !== false) {
        console.warn(
          `[seed:info] Chưa có tài khoản Admin trong DB; trường createdBy/publishedBy tạm thời sử dụng Admin ID fixture mặc định ('${SEED_ACCOUNT_IDS.admin}').`,
        );
      }
      adminId = new ObjectId(SEED_ACCOUNT_IDS.admin);
    }
  }

  const itemsColl = db.collection('content_items');
  const versionsColl = db.collection('content_versions');
  const now = options.now || new Date();
  const records = [];
  /** @type {Array<{ contentId?: string, kind?: string, revision?: number, message: string }>} */
  const errors = [];

  // 3. Thứ tự nạp: knowledges -> questions -> scenarios -> decks (06 §13.1)

  // 3.1. Nạp knowledges
  const knowledges = Array.isArray(dataset.knowledges)
    ? dataset.knowledges
    : [];
  stats.knowledges.total = knowledges.length;
  for (const item of knowledges) {
    try {
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
      else if (res.synced) stats.knowledges.synced++;
      else stats.knowledges.skipped++;
      if (res.record) records.push(res.record);
    } catch (err) {
      errors.push({
        contentId: item.contentId,
        kind: 'knowledge',
        revision: item.revision,
        message: /** @type {Error} */ (err).message,
      });
      break;
    }
  }

  // 3.2. Nạp questions (chỉ chạy nếu knowledges không lỗi)
  if (errors.length === 0) {
    const questions = Array.isArray(dataset.questions) ? dataset.questions : [];
    stats.questions.total = questions.length;
    for (const item of questions) {
      try {
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
        else if (res.synced) stats.questions.synced++;
        else stats.questions.skipped++;
        if (res.record) records.push(res.record);
      } catch (err) {
        errors.push({
          contentId: item.contentId,
          kind: 'question',
          revision: item.revision,
          message: /** @type {Error} */ (err).message,
        });
        break;
      }
    }
  }

  // 3.3. Nạp scenarios (chỉ chạy nếu questions không lỗi)
  if (errors.length === 0) {
    const scenarios = Array.isArray(dataset.scenarios) ? dataset.scenarios : [];
    stats.scenarios.total = scenarios.length;
    for (const item of scenarios) {
      try {
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
        else if (res.synced) stats.scenarios.synced++;
        else stats.scenarios.skipped++;
        if (res.record) records.push(res.record);
      } catch (err) {
        errors.push({
          contentId: item.contentId,
          kind: 'scenario',
          revision: item.revision,
          message: /** @type {Error} */ (err).message,
        });
        break;
      }
    }
  }

  // 3.4. Nạp decks (chỉ chạy nếu scenarios không lỗi)
  if (errors.length === 0) {
    const decks = Array.isArray(dataset.decks) ? dataset.decks : [];
    stats.decks.total = decks.length;
    for (const item of decks) {
      try {
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
        else if (res.synced) stats.decks.synced++;
        else stats.decks.skipped++;
        if (res.record) records.push(res.record);
      } catch (err) {
        errors.push({
          contentId: item.contentId,
          kind: 'deck',
          revision: item.revision,
          message: /** @type {Error} */ (err).message,
        });
        break;
      }
    }
  }

  return {
    success: errors.length === 0,
    datasetName,
    stats,
    records,
    errors,
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

  // Fail-fast: Kiểm tra biến môi trường SEED_ADMIN_PASSWORD trước khi ghi bất kỳ tài khoản nào
  const adminExists = await usersColl.findOne(
    { emailKey: 'admin@example.com' },
    { projection: { _id: 1 } },
  );
  const rawAdminPassword =
    options.adminPassword ?? process.env.SEED_ADMIN_PASSWORD;

  let normalizedAdminPassword = '';
  if (!adminExists) {
    if (
      rawAdminPassword === undefined ||
      rawAdminPassword === null ||
      (typeof rawAdminPassword === 'string' && rawAdminPassword.trim() === '')
    ) {
      throw new Error(
        '[seed] Bắt buộc cung cấp biến môi trường SEED_ADMIN_PASSWORD để khởi tạo tài khoản Admin (06 §13.1). Tuyệt đối không dùng mật khẩu mặc định.',
      );
    }
    normalizedAdminPassword = normalizeSeedPassword(
      rawAdminPassword,
      'SEED_ADMIN_PASSWORD',
    );
  } else if (rawAdminPassword && String(rawAdminPassword).trim() !== '') {
    normalizedAdminPassword = normalizeSeedPassword(
      rawAdminPassword,
      'SEED_ADMIN_PASSWORD',
    );
  }

  const rawUserPassword =
    options.userPassword ?? process.env.SEED_USER_PASSWORD;
  let normalizedUserPassword = '';
  const usingRandomUserPassword =
    rawUserPassword === undefined ||
    rawUserPassword === null ||
    (typeof rawUserPassword === 'string' && rawUserPassword.trim() === '');

  if (!usingRandomUserPassword) {
    normalizedUserPassword = normalizeSeedPassword(
      rawUserPassword,
      'SEED_USER_PASSWORD',
    );
  }

  /** @type {string[]} */
  const randomPasswordAccounts = [];
  /** @type {string[]} */
  const existingAccounts = [];

  for (const user of SEED_USER_FIXTURES) {
    const existing = await usersColl.findOne(
      { emailKey: user.emailKey },
      { projection: { _id: 1 } },
    );

    if (existing) {
      skipped++;
      existingAccounts.push(user.emailKey);
    } else {
      let passwordHash;
      if (user.role === 'admin') {
        passwordHash = await hashPassword(normalizedAdminPassword);
      } else if (!usingRandomUserPassword) {
        passwordHash = await hashPassword(normalizedUserPassword);
      } else {
        randomPasswordAccounts.push(user.emailKey);
        passwordHash = await hashPassword(randomBytes(32).toString('hex'));
      }

      await usersColl.insertOne({
        ...user,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      inserted++;
    }

    // Đảm bảo actor_state luôn tồn tại cho mọi tài khoản fixture (idempotent & partial-failure healing)
    const actorId = (existing?._id ?? user._id).toHexString();
    await actorStatesColl.updateOne(
      /** @type {any} */ ({ _id: `user:${actorId}` }),
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
  }

  if (existingAccounts.length > 0 && !usingRandomUserPassword) {
    console.info(
      `[seed:info] ${existingAccounts.length} tài khoản đã tồn tại (${existingAccounts.join(', ')}); mật khẩu hiện tại trong DB được giữ nguyên, SEED_USER_PASSWORD/SEED_ADMIN_PASSWORD không áp dụng cho các tài khoản này.`,
    );
  }

  if (randomPasswordAccounts.length > 0) {
    console.warn(
      `[seed:warning] SEED_USER_PASSWORD không được cấu hình. Các tài khoản (${randomPasswordAccounts.join(', ')}) được khởi tạo với mật khẩu ngẫu nhiên và sẽ chưa thể đăng nhập cho đến khi đặt SEED_USER_PASSWORD rồi nạp lại hoặc đặt lại mật khẩu thủ công.`,
    );
  }

  if (inserted > 0) {
    await statsColl.updateOne(
      /** @type {any} */ ({ _id: 'lifetime' }),
      {
        $inc: { registeredAccounts: inserted },
        $setOnInsert: {
          startedSessions: 0,
          reviewCount: 0,
          submittedQuizCount: 0,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  }

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
 *   datasets: Array<{
 *     datasetName: string,
 *     stats: any,
 *     records?: Array<{
 *       contentId: string,
 *       versionId: string,
 *       kind: string,
 *       revision: number,
 *       action: 'inserted' | 'recovered' | 'pointer_synced' | 'preserved' | 'unchanged',
 *       versionInserted: boolean
 *     }>,
 *     errors: Array<{ contentId?: string, kind?: string, revision?: number, message: string }>
 *   }>,
 *   fixtures?: { inserted: number, skipped: number, total: number },
 *   records?: Array<{
 *     contentId: string,
 *     versionId: string,
 *     kind: string,
 *     revision: number,
 *     action: 'inserted' | 'recovered' | 'pointer_synced' | 'preserved' | 'unchanged',
 *     versionInserted: boolean
 *   }>,
 *   summary: { totalItems: number, totalInserted: number, totalSynced: number, totalSkipped: number }
 * }>}
 */
export async function seedAll(db, options = {}) {
  assertDatabaseNotProtected(db, options);

  const datasetKeys = options.datasets || Object.keys(AVAILABLE_DATASETS);
  const includeFixtures = options.includeFixtures !== false;

  // 1. Fail-fast liên dataset: Kiểm tra tồn tại và validate schema của toàn bộ dataset TRƯỚC KHI GHI (S1)
  const resolved = datasetKeys.map((key) => {
    const dataset = AVAILABLE_DATASETS[key];
    if (!dataset) {
      // Tên dataset không tồn tại là lỗi lập trình/CLI -> giữ nguyên throw
      throw new Error(`Không tìm thấy dataset với tên '${key}'.`);
    }
    return { key, dataset, validation: validateSeedDataset(dataset) };
  });

  const invalid = resolved.filter((r) => !r.validation.isValid);
  if (invalid.length > 0) {
    return {
      success: false,
      datasets: invalid.map((r) => ({
        datasetName: r.key,
        stats: createEmptyStats(),
        records: [],
        errors: r.validation.errors.map((message) => ({ message })),
      })),
      records: [],
      summary: {
        totalItems: 0,
        totalInserted: 0,
        totalSynced: 0,
        totalSkipped: 0,
      },
    };
  }

  // 2. Fail-fast kiểm tra mật khẩu trước khi ghi bất kỳ dữ liệu nào (F2 & T4a)
  if (includeFixtures) {
    const adminExists = await db
      .collection('users')
      .findOne({ emailKey: 'admin@example.com' }, { projection: { _id: 1 } });
    const rawAdminPassword =
      options.adminPassword ?? process.env.SEED_ADMIN_PASSWORD;

    if (!adminExists) {
      if (
        rawAdminPassword === undefined ||
        rawAdminPassword === null ||
        (typeof rawAdminPassword === 'string' && rawAdminPassword.trim() === '')
      ) {
        throw new Error(
          '[seed] Bắt buộc cung cấp biến môi trường SEED_ADMIN_PASSWORD để khởi tạo tài khoản Admin (06 §13.1). Tuyệt đối không dùng mật khẩu mặc định.',
        );
      }
      normalizeSeedPassword(rawAdminPassword, 'SEED_ADMIN_PASSWORD');
    } else if (rawAdminPassword && String(rawAdminPassword).trim() !== '') {
      normalizeSeedPassword(rawAdminPassword, 'SEED_ADMIN_PASSWORD');
    }

    const rawUserPassword =
      options.userPassword ?? process.env.SEED_USER_PASSWORD;
    if (
      rawUserPassword !== undefined &&
      rawUserPassword !== null &&
      (typeof rawUserPassword !== 'string' || rawUserPassword.trim() !== '')
    ) {
      normalizeSeedPassword(rawUserPassword, 'SEED_USER_PASSWORD');
    }
  }

  let totalItems = 0;
  let totalInserted = 0;
  let totalSynced = 0;
  let totalSkipped = 0;
  const datasetResults = [];

  for (const item of resolved) {
    const res = await seedContentDataset(db, item.dataset, {
      datasetName: item.key,
      now: new Date(),
      forceProduction: options.forceProduction,
      warnOnMissingAdmin: !includeFixtures,
    });

    if (!res.success) {
      return {
        success: false,
        datasets: [...datasetResults, res],
        records: [
          ...datasetResults.flatMap((d) => d.records ?? []),
          ...(res.records ?? []),
        ],
        summary: { totalItems, totalInserted, totalSynced, totalSkipped },
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
      totalSynced += res.stats[g].synced;
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

  const allRecords = [];
  for (const ds of datasetResults) {
    if (Array.isArray(ds.records)) {
      allRecords.push(...ds.records);
    }
  }

  return {
    success: true,
    datasets: datasetResults,
    fixtures: fixturesResult,
    records: allRecords,
    summary: { totalItems, totalInserted, totalSynced, totalSkipped },
  };
}
