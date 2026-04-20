import type { NotamApiResponse } from '@/types/notam';

const LATEST_KEY = 'notams:latest';

function kvCreds() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
  }
  return { url: url.replace(/\/$/, ''), token };
}

async function kvFetch(path: string, init?: RequestInit) {
  const { url, token } = kvCreds();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`KV request ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ result: string | null }>;
}

export async function getLatestNotams(): Promise<NotamApiResponse | null> {
  const { result } = await kvFetch(`/get/${encodeURIComponent(LATEST_KEY)}`);
  if (!result) return null;
  try {
    return JSON.parse(result) as NotamApiResponse;
  } catch (err) {
    throw new Error(`KV value at ${LATEST_KEY} is not valid JSON: ${String(err)}`);
  }
}

export async function setLatestNotams(payload: NotamApiResponse): Promise<void> {
  await kvFetch(`/set/${encodeURIComponent(LATEST_KEY)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
