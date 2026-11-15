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
        console.error('[seed] Nạp dữ liệu thất bại do dataset không hợp lệ:');
        for (const ds of result.datasets) {
          if (ds.errors && ds.errors.length > 0) {
            console.error(`- Dataset [${ds.datasetName}]:`);
            for (const err of ds.errors) {
              console.error(`  * ${err}`);
            }
          }
        }
        process.exitCode = 1;
      } else {
        for (const ds of result.datasets) {
          printStatsTable(ds.datasetName, ds.stats);
        }

        if (result.fixtures) {
          console.info('\n--- Kết quả nạp tài khoản kiểm thử / demo ---');
          console.table({
            'Tài khoản (users)': result.fixtures,
          });
        }

        console.info(
          `\n[seed] Hoàn tất thành công: ${result.summary.totalInserted} bản ghi học liệu mới, ${result.summary.totalSkipped} bản ghi đã có từ trước (không sửa đổi revision bất biến).`,
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
