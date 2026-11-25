/**
 * Typed HTTP client for the FastAPI physics backend (/api proxied to 127.0.0.1:8000).
 */

export interface BackendHealthResponse {
  status: string;
  engine: string;
  version: string;
}

export interface BackendSelfTestItem {
  id: string;
  name: string;
  equation: string;
  expected: string | number;
  measured: string | number;
  expected_value?: number;
  measured_value?: number;
  unit?: string;
  tolerance?: number;
  passed: boolean;
  detail: string;
}

export interface BackendSelfTestResponse {
  all_passed: boolean;
  passed_count: number;
  total_count: number;
  tests: BackendSelfTestItem[];
}

export interface ApiErrorResult {
  ok: false;
  error: string;
  status?: number;
}

export interface ApiSuccessResult<T> {
  ok: true;
  data: T;
}

export type ApiResult<T> = ApiSuccessResult<T> | ApiErrorResult;

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4500): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Backend returned HTTP ${response.status} (${response.statusText || 'request failed'}).`,
      };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'Request timed out waiting for the Python backend at /api (127.0.0.1:8000).',
      };
    }
    return {
      ok: false,
      error: 'Python backend unreachable at /api. Start FastAPI on port 8000 to verify against Python.',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export function fetchBackendHealth(): Promise<ApiResult<BackendHealthResponse>> {
  return fetchJsonWithTimeout<BackendHealthResponse>('/api/health', 2500);
}

export function fetchBackendSelfTest(): Promise<ApiResult<BackendSelfTestResponse>> {
  return fetchJsonWithTimeout<BackendSelfTestResponse>('/api/self-test', 6000);
}
