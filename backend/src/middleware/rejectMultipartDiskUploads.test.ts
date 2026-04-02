import express from "express";
import request from "supertest";
import { buildRejectMultipartDiskUploadsDisabled } from "./rejectMultipartDiskUploads";

describe("multipart disk upload guard", () => {
  it("blocks multipart uploads when local disk uploads are disabled", async () => {
    const app = express();
    app.post(
      "/documents/upload",
      buildRejectMultipartDiskUploadsDisabled("documents", { enabled: false }),
      (_req, res) => res.status(201).json({ ok: true })
    );

    const response = await request(app)
      .post("/documents/upload")
      .field("documentType", "policy")
      .attach("file", Buffer.from("test"), {
        filename: "policy.txt",
        contentType: "text/plain",
      })
      .expect(503);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 503,
      })
    );
    expect(response.body.error).toContain("Local disk uploads are disabled");
    expect(response.body.details).toEqual({ bucket: "documents" });
  });

  it("allows non-multipart requests even when local disk uploads are disabled", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/knowledge-hub",
      buildRejectMultipartDiskUploadsDisabled("knowledge-hub", { enabled: false }),
      (_req, res) => res.status(201).json({ ok: true })
    );

    await request(app)
      .post("/knowledge-hub")
      .send({ title: "JSON-only resource" })
      .expect(201, { ok: true });
  });
});
