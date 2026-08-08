/** Cloudflare Worker entry point for Sushi Radar. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "no-referrer");
    headers.set("permissions-policy", "camera=(self), geolocation=(self)");
    if (url.pathname.startsWith("/api/admin/") || url.pathname.startsWith("/api/enrollment/") || url.pathname.startsWith("/api/web/")) {
      headers.set("cache-control", "no-store");
    }
    const isHtmlDocument = request.method === "GET" && (
      headers.get("content-type")?.includes("text/html")
      || request.headers.get("accept")?.includes("text/html")
    );
    if (isHtmlDocument) {
      // Revalidate the application shell on every launch so an installed PWA
      // cannot keep an obsolete HTML document pointing at old hashed assets.
      headers.set("cache-control", "no-cache, max-age=0, must-revalidate");
    }
    const securedResponse = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    if (!isHtmlDocument) return securedResponse;

    // Vinext 0.0.50 currently omits Next's viewportFit field when it renders
    // metadata. Rewrite only the existing viewport tag and keep the body
    // streaming so installed PWAs can use the full screen safe area.
    return new HTMLRewriter()
      .on('meta[name="viewport"]', {
        element(element) {
          element.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
        },
      })
      .transform(securedResponse);
  },
};

export default worker;
