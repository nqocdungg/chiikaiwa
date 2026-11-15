import {
  connectDatabase,
  disconnectDatabase,
} from '../server/persistence/database.js';
import {
  isProtectedDatabase,
  seedAll,
  seedTestAccountFixtures,
  AVAILABLE_DATASETS,
} from '../server/persistence/seed/seed-content.js';

/**
 * Phân tích tham số dòng lệnh.
 * @param {string[]} args
 */
function parseArgs(args) {
  const options = {
    help: false,
    sample: false,
    n1: false,
    fixturesOnly: false,
    contentOnly: false,
    forceProduction: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--sample') options.sample = true;
    else if (arg === '--n1') options.n1 = true;
    else if (arg === '--fixtures-only') options.fixturesOnly = true;
    else if (arg === '--content-only') options.contentOnly = true;
    else if (arg === '--force-production-seed') options.forceProduction = true;
    else {
      console.warn(`[seed] Cảnh báo: Tham số không xác định '${arg}'.`);
    }
  }

  if (options.fixturesOnly && options.contentOnly) {
    console.error(
      "[seed] Lỗi: Không thể dùng đồng thời '--fixtures-only' và '--content-only'.",
    );
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.info(`
Sử dụng: npm run db:seed [options] hoặc node scripts/seed.js [options]

Tùy chọn:
  --sample                 Chỉ nạp bộ học liệu mẫu (sample content N5-N4)
  --n1                     Chỉ nạp bộ học liệu N1 (n1 content)
  --fixtures-only          Chỉ nạp tài khoản kiểm thử / demo fixtures
  --content-only           Chỉ nạp học liệu, bỏ qua tài khoản kiểm thử
  --force-production-seed  Bắt buộc nạp trên database production (NGUY HIỂM)
  --help, -h               Hiển thị hướng dẫn này

Biến môi trường (06 §13.1):
  SEED_ADMIN_PASSWORD      Mật khẩu bắt buộc cho tài khoản Admin khi nạp fixtures
  SEED_USER_PASSWORD       Mật khẩu tùy chọn cho các tài khoản kiểm thử (learnerA, learnerB, learnerC, locked)
`);
}

/**
 * In bảng thống kê nạp học liệu.
 * @param {string} datasetName
 * @param {Record<string, any>} stats
 */
function printStatsTable(datasetName, stats) {
  console.info(`\n--- Kết quả nạp học liệu: [${datasetName}] ---`);
  console.table({
    'Kiến thức (knowledges)': stats.knowledges,
    'Câu hỏi (questions)': stats.questions,
    'Tình huống (scenarios)': stats.scenarios,
    'Bộ thẻ (decks)': stats.decks,
  });
}

const args = process.argv.slice(2);
const options = parseArgs(args);

if (options.help) {
  printHelp();
  process.exit(0);
}

try {
  const db = await connectDatabase();
  const dbName = db.databaseName;

  if (isProtectedDatabase(dbName) && !options.forceProduction) {
    console.error(
      `[seed] LỖI BẢO MẬT: Cơ sở dữ liệu '${dbName}' không thuộc whitelist dev/demo/test (fail-closed). Seed bị chặn theo quy định 06 §13.1. Nếu bạn chắc chắn, hãy chỉ định thêm '--force-production-seed'.`,
    );
    process.exitCode = 1;
  } else {
    console.info(
      `[seed] Bắt đầu seed dữ liệu vào cơ sở dữ liệu: '${dbName}'...`,
    );

    if (options.fixturesOnly) {
      const res = await seedTestAccountFixtures(db, {
        forceProduction: options.forceProduction,
        adminPassword: process.env.SEED_ADMIN_PASSWORD,
      });
      console.info(
        `[seed] Đã nạp fixtures: ${res.inserted} tạo mới, ${res.skipped} bỏ qua (tổng số: ${res.total}).`,
      );
    } else {
      let datasetKeys = [];
      if (options.sample) datasetKeys.push('sample');
      if (options.n1) datasetKeys.push('n1');
      if (datasetKeys.length === 0) {
        datasetKeys = Object.keys(AVAILABLE_DATASETS);
      }

      const result = await seedAll(db, {
        datasets: datasetKeys,
        includeFixtures: !options.contentOnly,
        forceProduction: options.forceProduction,
        adminPassword: process.env.SEED_ADMIN_PASSWORD,
      });

      if (!result.success) {
        console.error('[seed] Nạp dữ liệu thất bại:');
        for (const ds of result.datasets) {
          if (ds.errors && ds.errors.length > 0) {
            console.error(`- Dataset [${ds.datasetName}]:`);
            for (const err of ds.errors) {
              const msg =
                typeof err === 'string'
                  ? err
                  : `${err.kind ? `[${err.kind}] ` : ''}${err.contentId ? `ID: ${err.contentId} - ` : ''}${err.message}`;
              console.error(`  * ${msg}`);
            }
          }
        }

        if (Array.isArray(result.records) && result.records.length > 0) {
          console.warn(
            `\n[seed] Đã ghi ${result.records.length} bản ghi trước khi dừng (chạy lại seed an toàn vì idempotent):`,
          );
          console.table(
            result.records.map((r) => ({
              kind: r.kind,
              contentId: r.contentId,
              revision: r.revision,
              action: r.action,
            })),
          );
        }

        process.exitCode = 1;
      } else {
        for (const ds of result.datasets) {
          printStatsTable(ds.datasetName, ds.stats);
        }

        if (Array.isArray(result.records) && result.records.length > 0) {
          /** @type {Record<string, number>} */
          const actionCounts = result.records.reduce((acc, r) => {
            acc[r.action] = (acc[r.action] || 0) + 1;
            return acc;
          }, /** @type {Record<string, number>} */ ({}));
          console.info(
            '\n--- Thống kê chi tiết theo từng bản ghi (Records) ---',
          );
          console.table({
            'Tạo mới (inserted)': { số_lượng: actionCounts.inserted || 0 },
            'Phục hồi (recovered)': { số_lượng: actionCounts.recovered || 0 },
            'Đồng bộ con trỏ (pointer_synced)': {
              số_lượng: actionCounts.pointer_synced || 0,
            },
            'Bảo toàn dữ liệu (preserved)': {
              số_lượng: actionCounts.preserved || 0,
            },
            'Không thay đổi (unchanged)': {
              số_lượng: actionCounts.unchanged || 0,
            },
          });

          const notableRecords = result.records
            .filter((r) => r.action !== 'inserted' && r.action !== 'unchanged')
            .map((r) => ({
              kind: r.kind,
              contentId: r.contentId,
              revision: r.revision,
              action: r.action,
            }));

          if (notableRecords.length > 0) {
            console.info(
              '\n--- Danh sách học liệu được đồng bộ hoặc bảo toàn (recovered / pointer_synced / preserved) ---',
            );
            console.table(notableRecords);
          }
        }

        if (result.fixtures) {
          console.info('\n--- Kết quả nạp tài khoản kiểm thử / demo ---');
          console.table({
            'Tài khoản (users)': result.fixtures,
          });
        }

        console.info(
          `\n[seed] Hoàn tất thành công: ${result.summary.totalInserted} bản ghi học liệu mới, ${result.summary.totalSynced} bản ghi được đồng bộ/khôi phục, ${result.summary.totalSkipped} bản ghi được giữ nguyên/bỏ qua (bảo toàn revision bất biến).`,
        );
      }
    }
  }
} catch (error) {
  console.error(
    '[seed] Đã xảy ra lỗi nghiêm trọng khi chạy script seed:',
    error,
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
