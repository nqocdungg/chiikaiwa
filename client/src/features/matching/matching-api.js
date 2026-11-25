import { api } from '../../services/api-client.js';
import { ApiError } from '../../services/errors.js';

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/iu;
const COORDINATION_MODES = new Set([
  'idle',
  'searching',
  'proposed',
  'inviting',
  'requestingInvite',
  'inSession',
]);
const PROPOSAL_STATUSES = new Set([
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
]);
const VALID_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);
const VALID_DURATIONS = new Set([10, 20, 30]);

/**
 * @typedef {{ code: string, label: string }} CatalogStringItem
 * @typedef {{ code: number, label: string }} CatalogNumberItem
 * @typedef {{
 *   levels: CatalogStringItem[],
 *   durations: CatalogNumberItem[],
 *   goals: CatalogStringItem[],
 *   interests: CatalogStringItem[],
 *   languages: CatalogStringItem[],
 *   countries: CatalogStringItem[],
 *   ageGroups: CatalogStringItem[],
 *   genders: CatalogStringItem[],
 *   avatars?: CatalogStringItem[],
 * }} MatchingCatalogs
 * @typedef {{
 *   countryCode?: string,
 *   ageGroup?: string,
 *   gender?: string,
 * }} MatchingHardFilters
 * @typedef {{
 *   level: string,
 *   desiredMinutes: number,
 *   allowAdjacent: boolean,
 *   filters?: MatchingHardFilters,
 * }} MatchingCriteria
 * @typedef {{
 *   requestId: string,
 *   criteria: MatchingCriteria,
 *   queuedAt: string,
 *   leaseUntil: string,
 * }} ActiveSearch
 * @typedef {{
 *   mode: 'idle' | 'searching' | 'proposed' | 'inviting' | 'requestingInvite' | 'inSession',
 *   version: number,
 *   resourceId?: string,
 *   search?: ActiveSearch,
 * }} CoordinationState
 * @typedef {{
 *   level?: string,
 *   goal?: string,
 *   interests?: string[],
 *   nativeLanguage?: string,
 *   countryCode?: string,
 *   ageGroup?: string,
 *   gender?: string,
 * }} PartnerProfile
 * @typedef {{
 *   actorKey: string,
 *   displayName: string,
 *   avatarKey?: string,
 *   profile?: PartnerProfile,
 * }} MatchingPartner
 * @typedef {{
 *   id: string,
 *   status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired',
 *   version: number,
 *   partner: MatchingPartner,
 *   commonCriteria: unknown,
 *   suggestedMinutes: number,
 *   expiresAt: string,
 *   acceptedByMe: boolean,
 *   acceptedByPartner: boolean,
 *   sessionId?: string,
 * }} MatchProposal
 * @typedef {{
 *   readCatalogs: (options?: { signal?: AbortSignal }) => Promise<MatchingCatalogs>,
 *   readCoordination: (options?: { signal?: AbortSignal }) => Promise<{ data: CoordinationState, serverTime: string }>,
 *   createSearch: (criteria: MatchingCriteria, options: { idempotencyKey: string, signal?: AbortSignal }) => Promise<{ data: CoordinationState, serverTime: string }>,
 *   sendHeartbeat: (requestId: string, options?: { signal?: AbortSignal }) => Promise<{ data: { leaseUntil: string }, serverTime: string }>,
 *   cancelSearch: (params: { requestId: string, expectedVersion: number }, options: { idempotencyKey: string, signal?: AbortSignal }) => Promise<unknown>,
 *   readProposal: (proposalId: string, options?: { signal?: AbortSignal }) => Promise<{ data: MatchProposal, serverTime: string }>,
 *   respondToProposal: (proposal: { id: string, version: number }, decision: 'accept' | 'reject', options: { idempotencyKey: string, signal?: AbortSignal }) => Promise<{ data: MatchProposal, serverTime: string }>,
 *   cancelProposal: (proposal: { id: string, version: number }, options: { idempotencyKey: string, signal?: AbortSignal }) => Promise<unknown>,
 * }} MatchingApiAdapter
 */

/** @type {MatchingCatalogs} */
export const FALLBACK_CATALOGS = {
  levels: [
    { code: 'N5', label: 'N5' },
    { code: 'N4', label: 'N4' },
    { code: 'N3', label: 'N3' },
    { code: 'N2', label: 'N2' },
    { code: 'N1', label: 'N1' },
  ],
  durations: [
    { code: 10, label: '10 phút' },
    { code: 20, label: '20 phút' },
    { code: 30, label: '30 phút' },
  ],
  goals: [
    { code: 'dailyCommunication', label: 'Giao tiếp hằng ngày' },
    { code: 'travel', label: 'Du lịch' },
    { code: 'studyAndWork', label: 'Học tập và công việc' },
    { code: 'examPreparation', label: 'Củng cố kiến thức phục vụ kỳ thi' },
    { code: 'culturalExchange', label: 'Giao lưu văn hóa' },
  ],
  interests: [
    { code: 'music', label: 'Âm nhạc' },
    { code: 'filmAndAnime', label: 'Phim và anime' },
    { code: 'food', label: 'Ẩm thực' },
    { code: 'travel', label: 'Du lịch' },
    { code: 'books', label: 'Sách' },
    { code: 'games', label: 'Trò chơi' },
    { code: 'sports', label: 'Thể thao' },
    { code: 'technology', label: 'Công nghệ' },
  ],
  languages: [
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'ja', label: 'Tiếng Nhật' },
    { code: 'en', label: 'Tiếng Anh' },
    { code: 'zh', label: 'Tiếng Trung' },
    { code: 'ko', label: 'Tiếng Hàn' },
    { code: 'fr', label: 'Tiếng Pháp' },
    { code: 'de', label: 'Tiếng Đức' },
    { code: 'es', label: 'Tiếng Tây Ban Nha' },
    { code: 'th', label: 'Tiếng Thái' },
    { code: 'id', label: 'Tiếng Indonesia' },
    { code: 'other', label: 'Ngôn ngữ khác' },
  ],
  countries: [
    { code: 'VN', label: 'Việt Nam' },
    { code: 'JP', label: 'Nhật Bản' },
    { code: 'US', label: 'Hoa Kỳ' },
    { code: 'SG', label: 'Singapore' },
    { code: 'KR', label: 'Hàn Quốc' },
    { code: 'TW', label: 'Đài Loan' },
    { code: 'AU', label: 'Úc' },
    { code: 'CA', label: 'Canada' },
    { code: 'GB', label: 'Vương quốc Anh' },
    { code: 'DE', label: 'Đức' },
    { code: 'FR', label: 'Pháp' },
    { code: 'TH', label: 'Thái Lan' },
    { code: 'ID', label: 'Indonesia' },
    { code: 'MY', label: 'Malaysia' },
    { code: 'OTHER', label: 'Quốc gia khác' },
  ],
  ageGroups: [
    { code: 'under18', label: 'Dưới 18' },
    { code: '18to22', label: '18–22' },
    { code: '23to30', label: '23–30' },
    { code: 'over30', label: 'Trên 30' },
  ],
  genders: [
    { code: 'male', label: 'Nam' },
    { code: 'female', label: 'Nữ' },
    { code: 'other', label: 'Khác' },
  ],
};

function invalidResponse(
  message = 'Phản hồi ghép bạn không hợp lệ. Vui lòng thử lại.',
) {
  return new ApiError({
    status: 502,
    code: 'INVALID_RESPONSE',
    message,
  });
}

/** @param {unknown} value */
function isValidId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/** @param {unknown} value */
function isValidVersion(value) {
  return Number.isInteger(value) && Number(value) >= 0;
}

/** @param {unknown} value */
function isValidDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Strips any unexpected private fields (such as email) from Partner DTO per FR-ACC-06.
 * @param {unknown} raw
 * @returns {MatchingPartner}
 */
export function parsePartnerDto(raw) {
  const item = /** @type {Record<string, unknown>} */ (raw);
  if (
    !item ||
    typeof item !== 'object' ||
    typeof item.actorKey !== 'string' ||
    !item.actorKey.trim() ||
    typeof item.displayName !== 'string' ||
    !item.displayName.trim()
  ) {
    throw invalidResponse();
  }

  /** @type {PartnerProfile | undefined} */
  let profile;
  if (item.profile && typeof item.profile === 'object') {
    const rawProfile = /** @type {Record<string, unknown>} */ (item.profile);
    /** @type {PartnerProfile} */
    const cleaned = {};
    if (typeof rawProfile.level === 'string' && rawProfile.level) {
      cleaned.level = rawProfile.level;
    }
    if (typeof rawProfile.goal === 'string' && rawProfile.goal) {
      cleaned.goal = rawProfile.goal;
    }
    if (Array.isArray(rawProfile.interests)) {
      const interests = rawProfile.interests.filter(
        (entry) => typeof entry === 'string' && entry.length > 0,
      );
      if (interests.length > 0) cleaned.interests = interests;
    }
    if (
      typeof rawProfile.nativeLanguageCode === 'string' &&
      rawProfile.nativeLanguageCode
    ) {
      cleaned.nativeLanguage = rawProfile.nativeLanguageCode;
    } else if (
      typeof rawProfile.nativeLanguage === 'string' &&
      rawProfile.nativeLanguage
    ) {
      cleaned.nativeLanguage = rawProfile.nativeLanguage;
    }
    if (typeof rawProfile.countryCode === 'string' && rawProfile.countryCode) {
      cleaned.countryCode = rawProfile.countryCode;
    }
    if (typeof rawProfile.ageGroup === 'string' && rawProfile.ageGroup) {
      cleaned.ageGroup = rawProfile.ageGroup;
    }
    if (typeof rawProfile.gender === 'string' && rawProfile.gender) {
      cleaned.gender = rawProfile.gender;
    }
    if (Object.keys(cleaned).length > 0) {
      profile = cleaned;
    }
  }

  return {
    actorKey: item.actorKey,
    displayName: item.displayName,
    ...(typeof item.avatarKey === 'string' && item.avatarKey
      ? { avatarKey: item.avatarKey }
      : {}),
    ...(profile ? { profile } : {}),
  };
}

/**
 * @param {unknown} raw
 * @returns {CoordinationState}
 */
export function parseCoordinationDto(raw) {
  const item = /** @type {Record<string, unknown>} */ (raw);
  if (
    !item ||
    typeof item !== 'object' ||
    !COORDINATION_MODES.has(String(item.mode)) ||
    !isValidVersion(item.version)
  ) {
    throw invalidResponse();
  }

  const mode = /** @type {CoordinationState['mode']} */ (item.mode);
  const resourceId =
    typeof item.resourceId === 'string' && item.resourceId.trim()
      ? item.resourceId.trim()
      : undefined;

  if (
    (mode === 'proposed' ||
      mode === 'inSession' ||
      mode === 'inviting' ||
      mode === 'requestingInvite') &&
    !resourceId
  ) {
    throw invalidResponse();
  }

  /** @type {ActiveSearch | undefined} */
  let search;
  if (mode === 'searching') {
    const rawSearch = /** @type {Record<string, unknown>} */ (item.search);
    const rawCriteria = /** @type {Record<string, unknown>} */ (
      rawSearch?.criteria
    );
    if (
      !rawSearch ||
      typeof rawSearch !== 'object' ||
      typeof rawSearch.requestId !== 'string' ||
      !rawSearch.requestId.trim() ||
      !isValidDate(rawSearch.queuedAt) ||
      !isValidDate(rawSearch.leaseUntil) ||
      !rawCriteria ||
      typeof rawCriteria !== 'object' ||
      !VALID_LEVELS.has(String(rawCriteria.level)) ||
      !VALID_DURATIONS.has(Number(rawCriteria.desiredMinutes)) ||
      typeof rawCriteria.allowAdjacent !== 'boolean'
    ) {
      throw invalidResponse();
    }
    /** @type {MatchingHardFilters | undefined} */
    let filters;
    if (rawCriteria.filters && typeof rawCriteria.filters === 'object') {
      const f = /** @type {Record<string, unknown>} */ (rawCriteria.filters);
      /** @type {MatchingHardFilters} */
      const cleanedFilters = {};
      if (typeof f.countryCode === 'string' && f.countryCode) {
        cleanedFilters.countryCode = f.countryCode;
      }
      if (typeof f.ageGroup === 'string' && f.ageGroup) {
        cleanedFilters.ageGroup = f.ageGroup;
      }
      if (typeof f.gender === 'string' && f.gender) {
        cleanedFilters.gender = f.gender;
      }
      if (Object.keys(cleanedFilters).length > 0) {
        filters = cleanedFilters;
      }
    }
    search = {
      requestId: rawSearch.requestId.trim(),
      criteria: {
        level: String(rawCriteria.level),
        desiredMinutes: Number(rawCriteria.desiredMinutes),
        allowAdjacent: rawCriteria.allowAdjacent,
        ...(filters ? { filters } : {}),
      },
      queuedAt: String(rawSearch.queuedAt),
      leaseUntil: String(rawSearch.leaseUntil),
    };
  }

  return {
    mode,
    version: Number(item.version),
    ...(resourceId ? { resourceId } : {}),
    ...(search ? { search } : {}),
  };
}

/**
 * @param {unknown} raw
 * @returns {MatchProposal}
 */
export function parseProposalDto(raw) {
  const item = /** @type {Record<string, unknown>} */ (raw);
  if (
    !item ||
    typeof item !== 'object' ||
    !isValidId(item.id) ||
    !PROPOSAL_STATUSES.has(String(item.status)) ||
    !isValidVersion(item.version) ||
    !isValidDate(item.expiresAt) ||
    typeof item.acceptedByMe !== 'boolean' ||
    typeof item.acceptedByPartner !== 'boolean' ||
    !VALID_DURATIONS.has(Number(item.suggestedMinutes)) ||
    (item.sessionId !== undefined && !isValidId(item.sessionId)) ||
    (item.status === 'accepted' && !isValidId(item.sessionId))
  ) {
    throw invalidResponse();
  }

  const partner = parsePartnerDto(item.partner);
  if (item.commonCriteria === undefined || item.commonCriteria === null) {
    throw invalidResponse();
  }

  return {
    id: String(item.id),
    status: /** @type {MatchProposal['status']} */ (item.status),
    version: Number(item.version),
    partner,
    commonCriteria: item.commonCriteria,
    suggestedMinutes: Number(item.suggestedMinutes),
    expiresAt: String(item.expiresAt),
    acceptedByMe: item.acceptedByMe,
    acceptedByPartner: item.acceptedByPartner,
    ...(item.sessionId !== undefined
      ? { sessionId: String(item.sessionId) }
      : {}),
  };
}

/** @param {{data: unknown, meta?: {serverTime?: string}}} response */
function requireServerTime(response) {
  const serverTime = response.meta?.serverTime;
  if (!isValidDate(serverTime)) {
    throw invalidResponse();
  }
  return /** @type {string} */ (serverTime);
}

/**
 * Builds the exact request body for POST /matching/searches per 07 §5.
 * Omits empty filter keys so server validation never receives null/empty strings.
 *
 * @param {MatchingCriteria} criteria
 */
export function buildSearchPayload(criteria) {
  /** @type {MatchingHardFilters} */
  const filters = {};
  if (criteria.filters?.countryCode) {
    filters.countryCode = criteria.filters.countryCode;
  }
  if (criteria.filters?.ageGroup) {
    filters.ageGroup = criteria.filters.ageGroup;
  }
  if (criteria.filters?.gender) {
    filters.gender = criteria.filters.gender;
  }
  return {
    level: criteria.level,
    desiredMinutes: Number(criteria.desiredMinutes),
    allowAdjacent: Boolean(criteria.allowAdjacent),
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
  };
}

/**
 * Looks up a Vietnamese display label from a catalog list.
 * @param {Array<{code: string | number, label: string}> | undefined} list
 * @param {string | number | undefined} code
 */
export function getCatalogLabel(list, code) {
  if (code === undefined || code === null || code === '') return '';
  const match = list?.find((item) => item.code === code);
  return match?.label ?? String(code);
}

/** @type {MatchingApiAdapter} */
export const defaultMatchingApi = {
  async readCatalogs(options) {
    const response = await api.get('/catalogs', options);
    const data = /** @type {Partial<MatchingCatalogs>} */ (response.data);
    if (
      !data ||
      !Array.isArray(data.levels) ||
      !Array.isArray(data.durations) ||
      !Array.isArray(data.goals) ||
      !Array.isArray(data.interests) ||
      !Array.isArray(data.languages) ||
      !Array.isArray(data.countries) ||
      !Array.isArray(data.ageGroups) ||
      !Array.isArray(data.genders)
    ) {
      throw invalidResponse('Danh mục tiêu chí từ máy chủ không hợp lệ.');
    }
    return /** @type {MatchingCatalogs} */ (data);
  },

  async readCoordination(options) {
    const response = await api.get('/me/coordination', options);
    const serverTime = requireServerTime(response);
    return {
      data: parseCoordinationDto(response.data),
      serverTime,
    };
  },

  async createSearch(criteria, options) {
    const response = await api.post(
      '/matching/searches',
      buildSearchPayload(criteria),
      options,
    );
    const serverTime = requireServerTime(response);
    return {
      data: parseCoordinationDto(response.data),
      serverTime,
    };
  },

  async sendHeartbeat(requestId, options) {
    const response = await api.post(
      `/matching/searches/${encodeURIComponent(requestId)}/heartbeat`,
      {},
      options,
    );
    const serverTime = requireServerTime(response);
    const data = /** @type {{ leaseUntil?: unknown }} */ (response.data);
    if (!data || !isValidDate(data.leaseUntil)) {
      throw invalidResponse();
    }
    return {
      data: { leaseUntil: String(data.leaseUntil) },
      serverTime,
    };
  },

  async cancelSearch({ requestId, expectedVersion }, options) {
    return api.delete(
      `/matching/searches/${encodeURIComponent(requestId)}?expectedVersion=${expectedVersion}`,
      options,
    );
  },

  async readProposal(proposalId, options) {
    const response = await api.get(
      `/matching/proposals/${encodeURIComponent(proposalId)}`,
      options,
    );
    const serverTime = requireServerTime(response);
    return {
      data: parseProposalDto(response.data),
      serverTime,
    };
  },

  async respondToProposal(proposal, decision, options) {
    const response = await api.post(
      `/matching/proposals/${encodeURIComponent(proposal.id)}/responses`,
      { expectedVersion: proposal.version, decision },
      options,
    );
    const serverTime = requireServerTime(response);
    return {
      data: parseProposalDto(response.data),
      serverTime,
    };
  },

  async cancelProposal(proposal, options) {
    return api.delete(
      `/matching/proposals/${encodeURIComponent(proposal.id)}?expectedVersion=${proposal.version}`,
      options,
    );
  },
};
