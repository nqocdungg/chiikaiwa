import {
  FALLBACK_CATALOGS,
  getCatalogLabel,
} from '../features/matching/matching-api.js';
import { ApiError } from '../services/errors.js';

/**
 * Development-only fixtures for BE-028 matching endpoints (07 §5).
 * Production `/match` never imports this module; it always calls the real REST API.
 */

/**
 * Experimental dev-only formatter for Proposal.commonCriteria while BE-028
 * sub-schema is pending team sign-off. Not part of production contract.
 *
 * @param {unknown} commonCriteria
 * @param {import('../features/matching/matching-api.js').MatchingCatalogs} catalogs
 * @returns {string[]}
 */
export function formatExperimentalCommonCriteria(commonCriteria, catalogs) {
  if (!commonCriteria || typeof commonCriteria !== 'object') return [];
  const data = /** @type {Record<string, unknown>} */ (commonCriteria);
  /** @type {string[]} */
  const items = [];
  if (data.sameLevel === true) items.push('Cùng trình độ');
  if (typeof data.goal === 'string' && data.goal) {
    items.push(`Cùng mục tiêu: ${getCatalogLabel(catalogs.goals, data.goal)}`);
  }
  if (Array.isArray(data.sharedInterests) && data.sharedInterests.length > 0) {
    const labels = data.sharedInterests
      .filter((code) => typeof code === 'string')
      .map((code) => getCatalogLabel(catalogs.interests, code));
    if (labels.length > 0) items.push(`Sở thích chung: ${labels.join(', ')}`);
  }
  if (typeof data.nativeLanguage === 'string' && data.nativeLanguage) {
    items.push(
      `Cùng tiếng mẹ đẻ: ${getCatalogLabel(catalogs.languages, data.nativeLanguage)}`,
    );
  }
  return items;
}

export const MATCH_PREVIEW_STATES = [
  'criteria',
  'searching',
  'long-wait',
  'proposal',
  'waiting-partner',
  'expired',
  'rejected',
  'busy-invite',
  'network-error',
];

const PROPOSAL_ID = '507f1f77bcf86cd799439021';
const SESSION_ID = '507f1f77bcf86cd799439022';

/** @type {import('../features/auth/auth-context.js').SelfUser} */
export const PREVIEW_USER = {
  id: '507f1f77bcf86cd799439001',
  email: 'hanhnhi@example.com',
  displayName: 'Hạnh Nhi',
  avatarKey: 'chiikawa',
  role: 'learner',
  status: 'active',
  version: 2,
  profile: {
    level: 'N3',
    goal: 'dailyCommunication',
    interests: ['music', 'food'],
    nativeLanguageCode: 'vi',
    countryCode: 'VN',
    ageGroup: '18to22',
    gender: 'female',
  },
};

/**
 * Builds an isolated mock MatchingApiAdapter for `/__dev/match`.
 * @param {string} state
 * @returns {import('../features/matching/matching-api.js').MatchingApiAdapter}
 */
export function createMatchPreviewApi(state) {
  const nowMs = Date.now();
  const serverTime = new Date(nowMs).toISOString();
  const queuedAt =
    state === 'long-wait'
      ? new Date(nowMs - 125_000).toISOString()
      : new Date(nowMs - 18_000).toISOString();
  const leaseUntil = new Date(nowMs + 30_000).toISOString();
  const proposalExpiresAt =
    state === 'expired'
      ? new Date(nowMs - 1_000).toISOString()
      : new Date(nowMs + 28_000).toISOString();

  /** @type {import('../features/matching/matching-api.js').MatchProposal} */
  const baseProposal = {
    id: PROPOSAL_ID,
    status:
      state === 'expired'
        ? 'expired'
        : state === 'rejected'
          ? 'rejected'
          : 'pending',
    version: state === 'waiting-partner' ? 2 : 1,
    partner: {
      actorKey: 'user:507f1f77bcf86cd799439099',
      displayName: 'Minh Xuân',
      avatarKey: 'hachiware',
      profile: {
        level: 'N3',
        goal: 'dailyCommunication',
        interests: ['music', 'travel'],
        nativeLanguage: 'vi',
      },
    },
    commonCriteria: {
      sameLevel: true,
      goal: 'dailyCommunication',
      sharedInterests: ['music'],
      nativeLanguage: 'vi',
    },
    suggestedMinutes: 20,
    expiresAt: proposalExpiresAt,
    acceptedByMe: state === 'waiting-partner',
    acceptedByPartner: false,
  };

  /** @type {import('../features/matching/matching-api.js').CoordinationState} */
  let currentCoord;
  if (state === 'searching' || state === 'long-wait') {
    currentCoord = {
      mode: 'searching',
      version: 3,
      search: {
        requestId: 'req-preview-001',
        criteria: {
          level: 'N3',
          desiredMinutes: 20,
          allowAdjacent: true,
          filters: { countryCode: 'VN' },
        },
        queuedAt,
        leaseUntil,
      },
    };
  } else if (
    state === 'proposal' ||
    state === 'waiting-partner' ||
    state === 'expired' ||
    state === 'rejected'
  ) {
    currentCoord = {
      mode: 'proposed',
      version: 4,
      resourceId: PROPOSAL_ID,
    };
  } else if (state === 'busy-invite') {
    currentCoord = {
      mode: 'inviting',
      version: 2,
      resourceId: '507f1f77bcf86cd799439030',
    };
  } else {
    currentCoord = { mode: 'idle', version: 1 };
  }

  let currentProposal = { ...baseProposal };

  return {
    async readCatalogs() {
      return FALLBACK_CATALOGS;
    },
    async readCoordination() {
      if (state === 'network-error') {
        throw new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Dịch vụ ghép bạn đang tạm gián đoạn.',
        });
      }
      return { data: currentCoord, serverTime: new Date().toISOString() };
    },
    async createSearch(criteria) {
      const now = Date.now();
      currentCoord = {
        mode: 'searching',
        version: currentCoord.version + 1,
        search: {
          requestId: 'req-preview-new',
          criteria,
          queuedAt: new Date(now).toISOString(),
          leaseUntil: new Date(now + 30_000).toISOString(),
        },
      };
      return { data: currentCoord, serverTime: new Date(now).toISOString() };
    },
    async sendHeartbeat() {
      const now = Date.now();
      return {
        data: { leaseUntil: new Date(now + 30_000).toISOString() },
        serverTime: new Date(now).toISOString(),
      };
    },
    async cancelSearch() {
      currentCoord = { mode: 'idle', version: currentCoord.version + 1 };
      return { data: null, meta: { serverTime } };
    },
    async readProposal() {
      return { data: currentProposal, serverTime: new Date().toISOString() };
    },
    async respondToProposal(_proposal, decision) {
      const now = new Date().toISOString();
      if (decision === 'reject') {
        currentProposal = {
          ...currentProposal,
          status: 'rejected',
          version: currentProposal.version + 1,
        };
      } else if (currentProposal.acceptedByPartner) {
        currentProposal = {
          ...currentProposal,
          status: 'accepted',
          acceptedByMe: true,
          version: currentProposal.version + 1,
          sessionId: SESSION_ID,
        };
      } else {
        currentProposal = {
          ...currentProposal,
          acceptedByMe: true,
          version: currentProposal.version + 1,
        };
      }
      return { data: currentProposal, serverTime: now };
    },
    async cancelProposal() {
      currentProposal = {
        ...currentProposal,
        status: 'cancelled',
        version: currentProposal.version + 1,
      };
      currentCoord = { mode: 'idle', version: currentCoord.version + 1 };
      return { data: null, meta: { serverTime } };
    },
  };
}
