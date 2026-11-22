import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { App } from '../../client/src/App.jsx';
import { AuthContext } from '../../client/src/features/auth/auth-context.js';
import { MatchPage } from '../../client/src/features/matching/MatchPage.jsx';
import { FALLBACK_CATALOGS } from '../../client/src/features/matching/matching-api.js';
import {
  MATCH_HEARTBEAT_INTERVAL_MS,
  MATCH_POLL_INTERVAL_MS,
} from '../../client/src/features/matching/use-matching-flow.js';
import { api } from '../../client/src/services/api-client.js';
import { ApiError } from '../../client/src/services/errors.js';

const PROPOSAL_ID = '507f1f77bcf86cd799439021';
const SESSION_ID = '507f1f77bcf86cd799439022';
const BASE_TIME = '2026-11-22T10:00:00.000Z';
const LEASE_UNTIL = '2026-11-22T10:00:30.000Z';
const PROPOSAL_EXPIRES_AT = '2026-11-22T10:00:30.000Z';

/** @param {unknown} data @param {string} [serverTime] */
function envelope(data, serverTime = BASE_TIME) {
  return { data, meta: { serverTime }, epoch: 0 };
}

function makeSearchingCoord(overrides = {}) {
  return {
    mode: 'searching',
    version: 3,
    search: {
      requestId: 'req-match-01',
      criteria: {
        level: 'N3',
        desiredMinutes: 20,
        allowAdjacent: true,
        filters: { countryCode: 'VN' },
      },
      queuedAt: BASE_TIME,
      leaseUntil: LEASE_UNTIL,
    },
    ...overrides,
  };
}

function makeProposal(overrides = {}) {
  return {
    id: PROPOSAL_ID,
    status: 'pending',
    version: 1,
    partner: {
      actorKey: 'user:507f1f77bcf86cd799439099',
      displayName: 'Minh Xuân',
      avatarKey: 'hachiware',
      email: 'secret-partner@example.com',
      profile: {
        level: 'N3',
        goal: 'dailyCommunication',
        interests: ['music'],
        nativeLanguage: 'vi',
      },
    },
    commonCriteria: {
      sameLevel: true,
      goal: 'dailyCommunication',
      sharedInterests: ['music'],
    },
    suggestedMinutes: 20,
    expiresAt: PROPOSAL_EXPIRES_AT,
    acceptedByMe: false,
    acceptedByPartner: false,
    ...overrides,
  };
}

/** @param {{ profile?: Record<string, unknown>, strict?: boolean }} [options] */
function renderMatch({
  profile = {
    level: 'N3',
    goal: 'dailyCommunication',
    interests: ['music'],
    nativeLanguageCode: 'vi',
  },
  strict = false,
} = {}) {
  const authValue = {
    user: {
      id: '507f1f77bcf86cd799439001',
      email: 'hanhnhi@example.com',
      displayName: 'Hạnh Nhi',
      avatarKey: 'chiikawa',
      role: /** @type {const} */ ('learner'),
      status: /** @type {const} */ ('active'),
      version: 1,
      profile,
    },
    guest: null,
    kind: /** @type {const} */ ('user'),
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    isLoading: false,
    isCheckingAuth: false,
    isLoginPending: false,
    error: null,
    checkAuth: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    updateUser: vi.fn(),
    refreshSession: vi.fn(),
  };

  const tree = (
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/match']}>
        <Routes>
          <Route path="/match" element={<MatchPage />} />
          <Route path="/room/:sessionId" element={<h1>Phòng Kaiwa</h1>} />
          <Route path="/invitation" element={<h1>Phòng mã mời</h1>} />
          <Route path="/saved" element={<h1>Ôn cá nhân</h1>} />
          <Route path="/home" element={<h1>Trang chính</h1>} />
          <Route path="/login" element={<h1>Đăng nhập</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('FE-015 auto-matching UI (SC-05)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  });

  it('submits required criteria and optional hard filters to POST /matching/searches and transitions to searching', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination')
        return envelope({ mode: 'idle', version: 1 });
      throw new Error(`Unexpected GET ${path}`);
    });
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(envelope(makeSearchingCoord()));

    renderMatch({ profile: { goal: 'dailyCommunication' } });

    expect(
      await screen.findByRole('heading', { name: 'Tìm bạn Tomodachi' }),
    ).toBeVisible();
    // Level not in profile -> start button disabled until user selects a level
    const submitBtn = screen.getByRole('button', { name: 'Bắt đầu tìm' });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'N3' }));
    fireEvent.click(screen.getByRole('radio', { name: '20 phút' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Cho phép chênh 1 cấp/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở bộ lọc tùy chọn' }));
    fireEvent.change(screen.getByLabelText('Quốc gia đang sinh sống'), {
      target: { value: 'VN' },
    });

    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    expect(
      await screen.findByRole('heading', {
        name: /Đang tìm bạn luyện nói \(Tomodachi\)/i,
      }),
    ).toBeVisible();
    expect(postSpy).toHaveBeenCalledWith(
      '/matching/searches',
      {
        level: 'N3',
        desiredMinutes: 20,
        allowAdjacent: true,
        filters: { countryCode: 'VN' },
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it('restarts coordination recovery cleanly when StrictMode aborts the first request', async () => {
    let coordCalls = 0;
    vi.spyOn(api, 'get').mockImplementation((path, options) => {
      if (path === '/catalogs')
        return Promise.resolve(envelope(FALLBACK_CATALOGS));
      if (path === '/me/coordination') {
        coordCalls += 1;
        if (coordCalls === 1) {
          return new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
        }
        return Promise.resolve(envelope(makeSearchingCoord()));
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    renderMatch({ strict: true });

    expect(
      await screen.findByRole('heading', {
        name: /Đang tìm bạn luyện nói \(Tomodachi\)/i,
      }),
    ).toBeVisible();
    expect(coordCalls).toBe(2);
  });

  it('polls coordination every 2s, sends heartbeat every 10s, and handles lease expiry without auto re-search', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE_TIME));

    let coordCalls = 0;
    const getSpy = vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination') {
        coordCalls += 1;
        if (coordCalls <= 5) {
          return envelope(makeSearchingCoord());
        }
        // Server reconciled expired lease -> returns idle
        return envelope(
          { mode: 'idle', version: 4 },
          '2026-11-22T10:00:35.000Z',
        );
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValue(
        envelope(
          { leaseUntil: '2026-11-22T10:00:40.000Z' },
          '2026-11-22T10:00:10.000Z',
        ),
      );

    renderMatch();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('heading', {
        name: /Đang tìm bạn luyện nói \(Tomodachi\)/i,
      }),
    ).toBeVisible();

    // Advance 10s -> triggers heartbeat and multiple 2s polls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MATCH_HEARTBEAT_INTERVAL_MS);
    });

    expect(postSpy).toHaveBeenCalledWith(
      '/matching/searches/req-match-01/heartbeat',
      {},
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      getSpy.mock.calls.filter(([path]) => path === '/me/coordination').length,
    ).toBeGreaterThanOrEqual(5);

    // Next poll sees idle from server -> transitions to ended (leaseExpired), does NOT call POST /matching/searches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MATCH_POLL_INTERVAL_MS);
    });

    expect(
      screen.getByRole('heading', { name: 'Lượt tìm đã hết hạn giữ chỗ' }),
    ).toBeVisible();
    expect(
      postSpy.mock.calls.filter(([path]) => path === '/matching/searches'),
    ).toHaveLength(0);
  });

  it('shows 2-minute long-wait choices and cancels active search before switching flows', async () => {
    const twoMinutesAgo = new Date(
      Date.parse(BASE_TIME) - 125_000,
    ).toISOString();
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination') {
        return envelope(
          makeSearchingCoord({
            search: {
              ...makeSearchingCoord().search,
              queuedAt: twoMinutesAgo,
            },
          }),
        );
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    const deleteSpy = vi
      .spyOn(api, 'delete')
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Tạm gián đoạn',
        }),
      )
      .mockResolvedValueOnce({
        data: null,
        meta: { serverTime: BASE_TIME },
        epoch: 0,
      });

    renderMatch();

    expect(
      await screen.findByText(/Đã chờ hơn 2 phút chưa có đề nghị ghép/i),
    ).toBeVisible();

    // First attempt to switch to invitation fails -> must NOT navigate!
    fireEvent.click(screen.getByRole('button', { name: 'Mời bằng mã' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Phòng mã mời' })).toBeNull();

    // Retry reuses the same Idempotency-Key and navigates only after 204 confirmation
    const firstKey = deleteSpy.mock.calls[0][1]?.idempotencyKey;
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByRole('heading', { name: 'Phòng mã mời' }),
    ).toBeVisible();
    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy.mock.calls[0][0]).toBe(
      '/matching/searches/req-match-01?expectedVersion=3',
    );
    expect(deleteSpy.mock.calls[1][1]?.idempotencyKey).toBe(firstKey);
  });

  it('displays proposal without partner email, waits for partner after single accept, and enters room only after server confirms sessionId', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination') {
        return envelope({
          mode: 'proposed',
          version: 4,
          resourceId: PROPOSAL_ID,
        });
      }
      if (path === `/matching/proposals/${PROPOSAL_ID}`) {
        return envelope(makeProposal());
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce(
      envelope(
        makeProposal({
          version: 2,
          acceptedByMe: true,
          acceptedByPartner: false,
        }),
      ),
    );

    renderMatch();

    expect(await screen.findByText('Minh Xuân')).toBeVisible();
    // AC 3: partner email must NEVER be rendered
    expect(screen.queryByText(/secret-partner@example\.com/i)).toBeNull();
    expect(screen.getByText(/Thời lượng đề xuất: 20 phút/i)).toBeVisible();
    // Production does not assume unapproved commonCriteria sub-schema
    expect(
      screen.getByText('Thỏa mãn điều kiện trình độ và bộ lọc của hai bên.'),
    ).toBeVisible();
    expect(screen.getByRole('timer')).toBeVisible();

    // Accept -> only one side accepted, must NOT enter room yet
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý luyện cùng' }));

    expect(
      await screen.findByText('Bạn đã đồng ý. Đang chờ bạn luyện'),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Phòng Kaiwa' })).toBeNull();
    expect(postSpy).toHaveBeenCalledWith(
      `/matching/proposals/${PROPOSAL_ID}/responses`,
      { expectedVersion: 1, decision: 'accept' },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it('navigates to /room/:sessionId when server confirms both accepted with sessionId', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination') {
        return envelope({
          mode: 'proposed',
          version: 4,
          resourceId: PROPOSAL_ID,
        });
      }
      if (path === `/matching/proposals/${PROPOSAL_ID}`) {
        return envelope(makeProposal({ acceptedByPartner: true }));
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    vi.spyOn(api, 'post').mockResolvedValueOnce(
      envelope(
        makeProposal({
          status: 'accepted',
          version: 2,
          acceptedByMe: true,
          acceptedByPartner: true,
          sessionId: SESSION_ID,
        }),
      ),
    );

    renderMatch();

    expect(await screen.findByText('Minh Xuân')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý luyện cùng' }));

    expect(
      await screen.findByRole('heading', { name: 'Phòng Kaiwa' }),
    ).toBeVisible();
  });

  it('reloads authoritative server state on VERSION_CONFLICT during proposal accept without auto-retrying', async () => {
    let proposalReads = 0;
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination') {
        return envelope({
          mode: 'proposed',
          version: 4,
          resourceId: PROPOSAL_ID,
        });
      }
      if (path === `/matching/proposals/${PROPOSAL_ID}`) {
        proposalReads += 1;
        return envelope(
          proposalReads === 1
            ? makeProposal({ version: 1 })
            : makeProposal({ status: 'expired', version: 2 }),
        );
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Đề nghị đã thay đổi.',
        details: { currentVersion: 2 },
      }),
    );

    renderMatch();

    expect(await screen.findByText('Minh Xuân')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý luyện cùng' }));

    expect(
      await screen.findByRole('heading', { name: 'Đề nghị ghép đã hết hạn' }),
    ).toBeVisible();
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('handles proposal reject and never triggers automatic re-search', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination') {
        return envelope({
          mode: 'proposed',
          version: 4,
          resourceId: PROPOSAL_ID,
        });
      }
      if (path === `/matching/proposals/${PROPOSAL_ID}`) {
        return envelope(makeProposal());
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(
        envelope(makeProposal({ status: 'rejected', version: 2 })),
      );

    renderMatch();

    expect(await screen.findByText('Minh Xuân')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Đề nghị ghép chưa được chấp nhận',
      }),
    ).toBeVisible();
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
  });

  it('switches from long-wait search to real /invitation?mode=create route and mounts InvitationDialog after cancel', async () => {
    const twoMinutesAgo = new Date(
      Date.parse(BASE_TIME) - 125_000,
    ).toISOString();
    let searchCancelled = false;

    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') {
        return envelope({
          kind: 'user',
          user: {
            id: '507f1f77bcf86cd799439001',
            email: 'hanhnhi@example.com',
            displayName: 'Hạnh Nhi',
            avatarKey: 'chiikawa',
            role: 'learner',
            status: 'active',
            version: 1,
            profile: { level: 'N3' },
          },
        });
      }
      if (path === '/catalogs') return envelope(FALLBACK_CATALOGS);
      if (path === '/me/coordination') {
        return envelope(
          searchCancelled
            ? { mode: 'idle', version: 4 }
            : makeSearchingCoord({
                search: {
                  ...makeSearchingCoord().search,
                  queuedAt: twoMinutesAgo,
                },
              }),
        );
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    const deleteSpy = vi.spyOn(api, 'delete').mockImplementation(async () => {
      searchCancelled = true;
      return { data: null, meta: { serverTime: BASE_TIME }, epoch: 0 };
    });

    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce(
      envelope({
        id: '507f1f77bcf86cd799439055',
        code: 'ABCD234567',
        status: 'open',
        version: 1,
        expiresAt: '2026-11-22T10:10:00.000Z',
      }),
    );

    render(
      <MemoryRouter initialEntries={['/match']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Đã chờ hơn 2 phút chưa có đề nghị ghép/i),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Mời bằng mã' }));

    // Verifies real InvitationDialog mounted at /invitation?mode=create and created host code
    expect(
      await screen.findByRole('heading', { name: 'Mời bạn cùng luyện' }),
    ).toBeVisible();
    expect(screen.getByText('ABCD234567')).toBeVisible();
    expect(deleteSpy).toHaveBeenCalledWith(
      '/matching/searches/req-match-01?expectedVersion=3',
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(postSpy).toHaveBeenCalledWith(
      '/invitations',
      {},
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });
});
