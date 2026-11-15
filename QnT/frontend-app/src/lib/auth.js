/**
 * Authentication utility functions
 * Centralized token management to prevent null/undefined token errors
 */

/**
 * Get the authentication token from localStorage
 * Returns null if token doesn't exist or is invalid
 * @returns {string|null} The token or null
 */
export function getToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  
  // Try 'access_token' first (new key), then fall back to 'token' (legacy)
  let token = localStorage.getItem('access_token');
  if (!token || token === 'null' || token === 'undefined') {
    token = localStorage.getItem('token');
  }
  
  // Validate token format
  if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
    return null;
  }
  
  return token;
}

/**
 * Set the authentication token in localStorage
 * @param {string} token - The token to store
 */
export function setToken(token) {
  if (typeof window !== 'undefined' && token && token !== 'null' && token !== 'undefined') {
    localStorage.setItem('access_token', token);
    localStorage.setItem('token', token); // Keep for backward compatibility
  }
}

/**
 * Remove the authentication token from localStorage
 */
export function removeToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('token');
  }
}

/**
 * Check if user is authenticated (has a valid token)
 * @returns {boolean}
 */
export function isAuthenticated() {
  return getToken() !== null;
}

/**
 * Get Authorization header value for fetch requests
 * @returns {string|null} Bearer token or null
 */
export function getAuthHeader() {
  const token = getToken();
  return token ? `Bearer ${token}` : null;
}
