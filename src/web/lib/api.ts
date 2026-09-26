export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly body: unknown = null,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type PydanticError = { loc?: (string | number)[]; msg?: string };

export function formatDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("detail" in body)) return fallback;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const lines = (detail as PydanticError[]).map((e) => {
      const field = (e.loc ?? []).filter((p) => p !== "body").join(".");
      return field ? `${field}: ${e.msg ?? "invalid"}` : (e.msg ?? "invalid");
    });
    if (lines.length) return lines.join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body !== undefined && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, formatDetail(body, res.statusText || `HTTP ${res.status}`), body);
  }
  return body as T;
}

export const json = (data: unknown): RequestInit["body"] => JSON.stringify(data);
