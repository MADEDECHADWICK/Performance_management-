import express from "express";
import request from "supertest";
import { buildHttpRateLimitMiddleware } from "./httpRateLimit";

describe("http rate limit middleware", () => {
  it("throttles repeated requests and returns rate limit headers", async () => {
    const app = express();
    app.use(
      buildHttpRateLimitMiddleware({
        enabled: true,
        maxRequests: 2,
        windowMs: 60_000,
      })
    );
    app.get("/api/test", (_req, res) => res.json({ ok: true }));

    await request(app).get("/api/test").expect(200);
    await request(app).get("/api/test").expect(200);
    const response = await request(app).get("/api/test").expect(429);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 429,
        error: "Too many requests. Please retry later.",
      })
    );
    expect(response.headers["x-ratelimit-limit"]).toBe("2");
    expect(response.headers["x-ratelimit-remaining"]).toBe("0");
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("skips configured health endpoints", async () => {
    const app = express();
    app.use(
      buildHttpRateLimitMiddleware({
        enabled: true,
        maxRequests: 1,
        windowMs: 60_000,
      })
    );
    app.get("/health", (_req, res) => res.json({ ok: true }));

    await request(app).get("/health").expect(200);
    await request(app).get("/health").expect(200);
  });
});
