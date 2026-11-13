// The Pro scanner rebuilds both boards every minute from the same keyless sources the plugin uses (Polymarket, Kalshi, DexScreener,
// GeckoTerminal, RugCheck, Jupiter). Within a minute their answers barely change, and the 24h and 1h boards ask for many of the same
// URLs, so a short cache in front of fetch keeps the scanner well inside each source's free rate limit. The plugin's code calls the
// global fetch, so installing the cache there needs no change to it.

type Stored = { at: number; status: number; headers: [string, string][]; body: ArrayBuffer };

/** How long an answer stays fresh: safety reports change slowly, prices and odds quickly. */
const TTL: [RegExp, number][] = [
  [/^https:\/\/api\.rugcheck\.xyz\//, 10 * 60_000],
  [/^https:\/\/(lite-)?api\.jup\.ag\/tokens\//, 2 * 60_000],
  [/^https:\/\/api\.geckoterminal\.com\//, 60_000],
];
const DEFAULT_TTL = 45_000; // under the 60 s scan interval, so every scan reads fresh odds and prices
const MAX_ENTRIES = 3000;

const ttlOf = (url: string) => TTL.find(([re]) => re.test(url))?.[1] ?? DEFAULT_TTL;

/** Resolves with `p`, or rejects with the signal's reason (a TimeoutError, which the plugin reports by host) once it aborts. */
function race<T>(p: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export type CacheStats = { hits: number; misses: number; shared: number; entries: number };

/** Caches successful GETs for a short time and shares one request between concurrent callers of the same URL. */
export function installFetchCache(): () => CacheStats {
  const real = globalThis.fetch;
  const cache = new Map<string, Stored>();
  const inflight = new Map<string, Promise<Stored>>();
  const stats = { hits: 0, misses: 0, shared: 0 };

  const toResponse = (s: Stored) => new Response(s.body.slice(0), { status: s.status, headers: s.headers });

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (method !== "GET" || !url.startsWith("https://")) return real(input, init);
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttlOf(url)) { stats.hits++; return toResponse(hit); }
    let pending = inflight.get(url);
    if (pending) stats.shared++;
    else {
      stats.misses++;
      // The shared request gets its own generous timeout: one caller's short deadline must not cancel it for the others.
      pending = real(url, { headers: init?.headers, signal: AbortSignal.timeout(20_000) })
        .then(async (r) => ({ at: Date.now(), status: r.status, headers: [...r.headers], body: await r.arrayBuffer() }))
        .finally(() => inflight.delete(url));
      inflight.set(url, pending);
    }
    const got = await race(pending, init?.signal);
    if (got.status === 200) {
      cache.set(url, got);
      if (cache.size > MAX_ENTRIES) {
        const now = Date.now();
        for (const [k, v] of cache) if (now - v.at >= ttlOf(k)) cache.delete(k);
        // Still full of fresh entries: drop the oldest (Map keeps insertion order).
        for (const k of cache.keys()) { if (cache.size <= MAX_ENTRIES) break; cache.delete(k); }
      }
    }
    return toResponse(got);
  }) as typeof fetch;

  return () => ({ ...stats, entries: cache.size });
}
