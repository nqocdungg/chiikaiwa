import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { AuthContext } from '../features/auth/auth-context.js';
import { MatchPage } from '../features/matching/MatchPage.jsx';
import {
  createMatchPreviewApi,
  formatExperimentalCommonCriteria,
  MATCH_PREVIEW_STATES,
  PREVIEW_USER,
} from './match-fixtures.js';

export function MatchPreview() {
  const [query, setQuery] = useSearchParams();
  const rawState = query.get('state') ?? 'criteria';
  const view = MATCH_PREVIEW_STATES.includes(rawState) ? rawState : 'criteria';
  const matchingApi = useMemo(() => createMatchPreviewApi(view), [view]);

  const authValue = useMemo(
    () => ({
      user: PREVIEW_USER,
      guest: null,
      kind: /** @type {const} */ ('user'),
      role: /** @type {const} */ ('learner'),
      status: /** @type {const} */ ('active'),
      isLoading: false,
      isCheckingAuth: false,
      isLoginPending: false,
      error: null,
      checkAuth: async () => undefined,
      login: async () => PREVIEW_USER,
      logout: async () => undefined,
      register: async () => PREVIEW_USER,
      updateUser: () => undefined,
      refreshSession: async () => undefined,
    }),
    [],
  );

  return (
    <div>
      {query.get('clean') !== '1' ? (
        <div className="ck-room-preview-toolbar">
          <strong>
            Xem trước SC-05 · Fixture mô phỏng BE-028 (chỉ dùng phát triển)
          </strong>
          <label>
            Trạng thái{' '}
            <select
              value={view}
              onChange={(event) => {
                query.set('state', event.target.value);
                setQuery(query);
              }}
            >
              {MATCH_PREVIEW_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <AuthContext.Provider value={authValue}>
        <MatchPage
          key={view}
          matchingApi={matchingApi}
          formatCommonCriteria={formatExperimentalCommonCriteria}
        />
      </AuthContext.Provider>
    </div>
  );
}
