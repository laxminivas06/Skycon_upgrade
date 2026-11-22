/**
 * SKYCON — Resilient Cloud & Local API Client
 * 
 * Provides unified, resilient request handling for Ground Station API endpoints:
 * 1. Primary: Relative path (e.g. /api/missions/active), routed through local server / proxy.
 * 2. Cloud Fallback: Direct PythonAnywhere cloud backend (https://teamskycon.pythonanywhere.com/api/...)
 *    if the local proxy returns 502/503/504 Bad Gateway or network is unreachable.
 * 3. Short-circuit: If proxy recently failed with 502, bypasses proxy to directly query PythonAnywhere
 *    to avoid flooding the browser console with gateway errors.
 * 4. Background Wakeup: Pings /health on app launch to preemptively warm up the backend.
 */

const CLOUD_PROD_API_BASE = 'https://teamskycon.pythonanywhere.com';

let directCloudUntil = 0;

export async function fetchWithFallback(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const isRemote = typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

  // If proxy recently failed with 502/503/504, go directly to PythonAnywhere backend
  if (isRemote && Date.now() < directCloudUntil) {
    try {
      const directUrl = `${CLOUD_PROD_API_BASE}${cleanEndpoint}`;
      return await fetch(directUrl, options);
    } catch (err) {
      // Fallback to standard request below
    }
  }

  // 1. Try local / proxy endpoint first
  try {
    const res = await fetch(cleanEndpoint, options);
    
    // If proxy returns 502/503/504, attempt direct PythonAnywhere fallback and remember for 30s
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      if (isRemote) {
        directCloudUntil = Date.now() + 30000;
        const directUrl = `${CLOUD_PROD_API_BASE}${cleanEndpoint}`;
        try {
          const directRes = await fetch(directUrl, options);
          return directRes;
        } catch {
          return res;
        }
      }
    }
    return res;
  } catch (err) {
    // If network failed on proxy, try direct PythonAnywhere backend
    if (isRemote) {
      directCloudUntil = Date.now() + 30000;
      const directUrl = `${CLOUD_PROD_API_BASE}${cleanEndpoint}`;
      return await fetch(directUrl, options);
    }
    throw err;
  }
}

let isWokenUp = false;
export function wakeUpBackend(): void {
  if (typeof window === 'undefined' || isWokenUp) return;
  isWokenUp = true;
  // Fire-and-forget background ping to PythonAnywhere /health
  try {
    fetch(`${CLOUD_PROD_API_BASE}/health`, { mode: 'cors' }).catch(() => {});
  } catch {}
}

// Automatically wake up backend once when client module loads
wakeUpBackend();
