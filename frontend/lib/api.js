export const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const SIGNED_OUT_SESSION_KEY = 'stallhub_signed_out';

export function markSessionSignedOut() {
  window.sessionStorage.setItem(SIGNED_OUT_SESSION_KEY, 'true');
}

export function clearSessionSignedOut() {
  window.sessionStorage.removeItem(SIGNED_OUT_SESSION_KEY);
}

export function isSessionSignedOut() {
  return window.sessionStorage.getItem(SIGNED_OUT_SESSION_KEY) === 'true';
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || 'Request failed.');
  }
  return result;
}

export async function logout() {
  await apiRequest('/auth/logout', { method: 'POST' });
}
