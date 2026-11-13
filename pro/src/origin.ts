// Hosts like Railway end HTTPS at their proxy, so the server sees http://… URLs. x402 puts the request's URL in the payment challenge,
// and PayBox refuses to pay when that URL isn't the one the plugin proposed ("Mismatched x402 resource URL"). So each request is given
// the public origin (PRO_PUBLIC_URL, which must match the plugin's ODDSHOT_PRO_URL) before any route or the payment middleware sees it.

/** The request as if it arrived at `origin`: same path, query and headers. Only GET and HEAD, the only methods Pro serves. */
export function withOrigin(req: Request, origin: string | null): Request {
  if (!origin || (req.method !== "GET" && req.method !== "HEAD")) return req;
  const u = new URL(req.url);
  if (u.origin === origin) return req;
  return new Request(origin + u.pathname + u.search, { method: req.method, headers: req.headers, signal: req.signal });
}
