/** Redirect to login when an authenticated API call returns 401. */
export function redirectIfUnauthorized(status: number, redirectPath = '/') {
  if (typeof window === 'undefined') return false
  if (status !== 401) return false
  const next = redirectPath.startsWith('/') ? redirectPath : '/'
  window.location.assign(`/login?redirect=${encodeURIComponent(next)}&error=session`)
  return true
}
