import mongoose from 'mongoose';

const { ObjectId } = mongoose.Types;

/**
 * Deterministic IDs cho các tài khoản kiểm thử và demo (02 §11.1).
 */
export const SEED_ACCOUNT_IDS = {
  learnerA: '507f1f77bcf86cd799439011',
  learnerB: '507f1f77bcf86cd799439022',
  learnerC: '507f1f77bcf86cd799439055',
  admin: '507f1f77bcf86cd799439033',
  locked: '507f1f77bcf86cd799439044',
};

/**
 * Danh sách tài khoản thử và demo chuẩn (02 §11.1: 4 tài khoản thử + 1 admin + 1 locked).
 * Đáp ứng đủ dữ liệu ghép phân biệt cấp độ N5, N4, N1, mục tiêu, sở thích.
 * Mọi tài khoản để passwordHash: null; kịch bản seedTestAccountFixtures sẽ băm động
 * từ biến môi trường hoặc sinh ngẫu nhiên trong runtime (06 §13.1).
 */
export const SEED_USER_FIXTURES = [
  {
    _id: new ObjectId(SEED_ACCOUNT_IDS.learnerA),
    email: 'learner.a@example.com',
    emailKey: 'learner.a@example.com',
    passwordHash: null,
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    displayName: 'Learner A',
    avatarKey: 'chiikawa',
    profile: {
      level: 'N5',
      goal: 'dailyCommunication',
      interests: ['music', 'travel'],
      nativeLanguageCode: 'vi',
    },
    authVersion: 0,
    version: 0,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },
  {
    _id: new ObjectId(SEED_ACCOUNT_IDS.learnerB),
    email: 'learner.b@example.com',
    emailKey: 'learner.b@example.com',
    passwordHash: null,
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    displayName: 'Learner B',
    avatarKey: 'hachiware',
    profile: {
      level: 'N4',
      goal: 'travel',
      interests: ['food', 'travel'],
      nativeLanguageCode: 'vi',
    },
    authVersion: 0,
    version: 0,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },
  {
    _id: new ObjectId(SEED_ACCOUNT_IDS.learnerC),
    email: 'learner.c@example.com',
    emailKey: 'learner.c@example.com',
    passwordHash: null,
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    displayName: 'Learner C',
    avatarKey: 'usagi',
    profile: {
      level: 'N1',
      goal: 'studyAndWork',
      interests: ['technology', 'books'],
      nativeLanguageCode: 'vi',
    },
    authVersion: 0,
    version: 0,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },
  {
    _id: new ObjectId(SEED_ACCOUNT_IDS.admin),
    email: 'admin@example.com',
    emailKey: 'admin@example.com',
    passwordHash: null,
    role: /** @type {const} */ ('admin'),
    status: /** @type {const} */ ('active'),
    displayName: 'Admin Root',
    avatarKey: 'usagi',
    profile: {
      interests: [],
    },
    authVersion: 0,
    version: 0,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },
  {
    _id: new ObjectId(SEED_ACCOUNT_IDS.locked),
    email: 'locked@example.com',
    emailKey: 'locked@example.com',
    passwordHash: null,
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('locked'),
    statusReason: 'compliance_hold',
    displayName: 'Locked Account',
    avatarKey: 'chiikawa',
    profile: {
      interests: [],
    },
    authVersion: 0,
    version: 0,
    statusChangedAt: new Date('2026-11-01T00:00:00.000Z'),
    statusChangedBy: new ObjectId(SEED_ACCOUNT_IDS.admin),
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },
];
