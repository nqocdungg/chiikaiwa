export const DEFAULT_AVATAR_KEY = 'chiikawa';

/**
 * Shared catalog options for profile and matchmaking (02 §2.4, 06 §2.2, 07 §4).
 * Each entry has `{ code, label }` where `code` is stored/validated and `label` is the Vietnamese display label.
 */
export const CATALOGS = Object.freeze({
  levels: Object.freeze([
    Object.freeze({ code: 'N5', label: 'N5' }),
    Object.freeze({ code: 'N4', label: 'N4' }),
    Object.freeze({ code: 'N3', label: 'N3' }),
    Object.freeze({ code: 'N2', label: 'N2' }),
    Object.freeze({ code: 'N1', label: 'N1' }),
  ]),
  durations: Object.freeze([
    Object.freeze({ code: 10, label: '10 phút' }),
    Object.freeze({ code: 20, label: '20 phút' }),
    Object.freeze({ code: 30, label: '30 phút' }),
  ]),
  goals: Object.freeze([
    Object.freeze({
      code: 'dailyCommunication',
      label: 'Giao tiếp hằng ngày',
    }),
    Object.freeze({ code: 'travel', label: 'Du lịch' }),
    Object.freeze({ code: 'studyAndWork', label: 'Học tập và công việc' }),
    Object.freeze({
      code: 'examPreparation',
      label: 'Củng cố kiến thức phục vụ kỳ thi',
    }),
    Object.freeze({ code: 'culturalExchange', label: 'Giao lưu văn hóa' }),
  ]),
  interests: Object.freeze([
    Object.freeze({ code: 'music', label: 'Âm nhạc' }),
    Object.freeze({ code: 'filmAndAnime', label: 'Phim và anime' }),
    Object.freeze({ code: 'food', label: 'Ẩm thực' }),
    Object.freeze({ code: 'travel', label: 'Du lịch' }),
    Object.freeze({ code: 'books', label: 'Sách' }),
    Object.freeze({ code: 'games', label: 'Trò chơi' }),
    Object.freeze({ code: 'sports', label: 'Thể thao' }),
    Object.freeze({ code: 'technology', label: 'Công nghệ' }),
  ]),
  languages: Object.freeze([
    Object.freeze({ code: 'vi', label: 'Tiếng Việt' }),
    Object.freeze({ code: 'ja', label: 'Tiếng Nhật' }),
    Object.freeze({ code: 'en', label: 'Tiếng Anh' }),
    Object.freeze({ code: 'zh', label: 'Tiếng Trung' }),
    Object.freeze({ code: 'ko', label: 'Tiếng Hàn' }),
    Object.freeze({ code: 'fr', label: 'Tiếng Pháp' }),
    Object.freeze({ code: 'de', label: 'Tiếng Đức' }),
    Object.freeze({ code: 'es', label: 'Tiếng Tây Ban Nha' }),
    Object.freeze({ code: 'th', label: 'Tiếng Thái' }),
    Object.freeze({ code: 'id', label: 'Tiếng Indonesia' }),
    Object.freeze({ code: 'other', label: 'Ngôn ngữ khác' }),
  ]),
  countries: Object.freeze([
    Object.freeze({ code: 'VN', label: 'Việt Nam' }),
    Object.freeze({ code: 'JP', label: 'Nhật Bản' }),
    Object.freeze({ code: 'US', label: 'Hoa Kỳ' }),
    Object.freeze({ code: 'SG', label: 'Singapore' }),
    Object.freeze({ code: 'KR', label: 'Hàn Quốc' }),
    Object.freeze({ code: 'TW', label: 'Đài Loan' }),
    Object.freeze({ code: 'AU', label: 'Úc' }),
    Object.freeze({ code: 'CA', label: 'Canada' }),
    Object.freeze({ code: 'GB', label: 'Vương quốc Anh' }),
    Object.freeze({ code: 'DE', label: 'Đức' }),
    Object.freeze({ code: 'FR', label: 'Pháp' }),
    Object.freeze({ code: 'TH', label: 'Thái Lan' }),
    Object.freeze({ code: 'ID', label: 'Indonesia' }),
    Object.freeze({ code: 'MY', label: 'Malaysia' }),
    Object.freeze({ code: 'OTHER', label: 'Quốc gia khác' }),
  ]),
  ageGroups: Object.freeze([
    Object.freeze({ code: 'under18', label: 'Dưới 18' }),
    Object.freeze({ code: '18to22', label: '18–22' }),
    Object.freeze({ code: '23to30', label: '23–30' }),
    Object.freeze({ code: 'over30', label: 'Trên 30' }),
  ]),
  genders: Object.freeze([
    Object.freeze({ code: 'male', label: 'Nam' }),
    Object.freeze({ code: 'female', label: 'Nữ' }),
    Object.freeze({ code: 'other', label: 'Khác' }),
  ]),
  avatars: Object.freeze([
    Object.freeze({ code: 'chiikawa', label: 'Chiikawa' }),
    Object.freeze({ code: 'hachiware', label: 'Hachiware' }),
    Object.freeze({ code: 'usagi', label: 'Usagi' }),
    Object.freeze({ code: 'momonga', label: 'Momonga' }),
    Object.freeze({ code: 'kurimanju', label: 'Kurimanju' }),
    Object.freeze({ code: 'rakko', label: 'Rakko' }),
    Object.freeze({ code: 'shisa', label: 'Shisa' }),
    Object.freeze({ code: 'kani', label: 'Furuhonya' }),
  ]),
});

/**
 * @param {readonly { code: string; label: string }[]} items
 * @returns {Set<string>}
 */
function toStringCodeSet(items) {
  return new Set(items.map((item) => item.code));
}

/**
 * @param {readonly { code: number; label: string }[]} items
 * @returns {Set<number>}
 */
function toNumberCodeSet(items) {
  return new Set(items.map((item) => item.code));
}

export const LEVEL_CODES = toStringCodeSet(CATALOGS.levels);
export const DURATION_CODES = toNumberCodeSet(CATALOGS.durations);
export const GOAL_CODES = toStringCodeSet(CATALOGS.goals);
export const INTEREST_CODES = toStringCodeSet(CATALOGS.interests);
export const LANGUAGE_CODES = toStringCodeSet(CATALOGS.languages);
export const COUNTRY_CODES = toStringCodeSet(CATALOGS.countries);
export const AGE_GROUP_CODES = toStringCodeSet(CATALOGS.ageGroups);
export const GENDER_CODES = toStringCodeSet(CATALOGS.genders);
export const AVATAR_CODES = toStringCodeSet(CATALOGS.avatars);

export const MAX_PROFILE_INTERESTS = 3;

/**
 * Returns the public catalog payload for GET /api/v1/catalogs (07 §4).
 */
export function getCatalogsDto() {
  return CATALOGS;
}
