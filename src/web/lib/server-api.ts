import { cookies } from "next/headers";
import { ApiError, formatDetail } from "./api";

const API = process.env.API_INTERNAL_URL || "http://localhost:8000";
const SOFT_FAIL = new Set([401, 403, 404]);

export async function serverApi<T = unknown>(path: string): Promise<T | null> {
  const cookie = (await cookies()).toString();
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json", ...(cookie ? { cookie } : {}) },
    cache: "no-store",
  });
  if (SOFT_FAIL.has(res.status)) return null;
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, formatDetail(body, `HTTP ${res.status}`), body);
  return body as T;
}
