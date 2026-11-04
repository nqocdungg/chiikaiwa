import { createContext } from 'react';

/**
 * @typedef {Object} UserProfile
 * @property {string} [level]
 * @property {string} [nativeLanguageCode]
 * @property {string} [goal]
 * @property {string[]} [interests]
 * @property {string} [countryCode]
 * @property {string} [ageGroup]
 * @property {string} [gender]
 */

/**
 * @typedef {Object} SelfUser
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {string} avatarKey
 * @property {'learner' | 'admin'} role
 * @property {UserProfile} [profile]
 * @property {number} version
 * @property {'active' | 'locked'} [status]
 */

/**
 * @typedef {Object} GuestSession
 * @property {string} [sessionId]
 * @property {string} [expiresAt]
 * @property {string} [status]
 */

/**
 * @typedef {Object} AuthState
 * @property {SelfUser | null} user
 * @property {GuestSession | null} guest
 * @property {'user' | 'guest' | 'unauthenticated'} kind
 * @property {'learner' | 'admin' | 'guest' | 'anonymous'} role
 * @property {'active' | 'locked' | 'expired' | null} status
 * @property {boolean} isLoading
 * @property {import('../../services/errors.js').ApiError | null} error
 * @property {() => Promise<void>} checkAuth
 * @property {(credentials: {email: string, password: string}) => Promise<SelfUser>} login
 * @property {() => Promise<void>} logout
 * @property {(payload: {email: string, password: string, displayName: string}) => Promise<SelfUser>} register
 * @property {(partial: Partial<SelfUser>) => void} updateUser
 * @property {() => Promise<void>} refreshSession
 */

/** @type {import('react').Context<AuthState | null>} */
export const AuthContext = createContext(
  /** @type {AuthState | null} */ (null),
);
