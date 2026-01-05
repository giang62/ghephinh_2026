export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : res.statusText;
    throw new Error(message);
  }
  return data as T;
}
