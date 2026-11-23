import { useContext } from 'react';
import { AuthContext } from './auth-context.js';

/**
 * Hook to access authentication and identity state.
 * @returns {import('./auth-context.js').AuthState}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
