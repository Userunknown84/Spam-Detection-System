// Verifies avatar upload validation (issue #447): oversized files and
// disallowed MIME types are rejected with a 400 before reaching the handler,
// while valid JPEG/PNG/WEBP uploads under the limit pass through. Mounts only
// the upload middleware on a throwaway Express app, so no DB or auth is needed.

const test = require("node:test");
const assert = require("node:assert");
const express = require("express");

const {
  handleAvatarUpload,
  MAX_AVATAR_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
} = require("../middleware/avatarUpload");

function startServer() {
  const app = express();
  // Stand-in for updateAvatar: only reached when validation passes.
  app.post("/avatar", handleAvatarUpload, (req, res) => {
    res.json({ ok: true, size: req.file ? req.file.size : 0 });
  });
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function uploadFile(url, { bytes, mimetype, filename }) {
  const form = new FormData();
  const blob = new Blob([Buffer.alloc(bytes, 1)], { type: mimetype });
  form.append("avatar", blob, filename);
  return fetch(url, { method: "POST", body: form });
}

test("rejects files larger than the size limit with a 400", async () => {
  const server = await startServer();
  const { port } = server.address();
  try {
    const res = await uploadFile(`http://127.0.0.1:${port}/avatar`, {
      bytes: MAX_AVATAR_BYTES + 1024,
      mimetype: "image/png",
      filename: "big.png",
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /too large/i);
  } finally {
    server.close();
  }
});

test("rejects non-image MIME types with a clear 400 error", async () => {
  const server = await startServer();
  const { port } = server.address();
  try {
    const res = await uploadFile(`http://127.0.0.1:${port}/avatar`, {
      bytes: 1024,
      mimetype: "application/pdf",
      filename: "doc.pdf",
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /invalid file type/i);
  } finally {
    server.close();
  }
});

test("rejects image types outside the allowed subset (e.g. gif)", async () => {
  const server = await startServer();
  const { port } = server.address();
  try {
    const res = await uploadFile(`http://127.0.0.1:${port}/avatar`, {
      bytes: 1024,
      mimetype: "image/gif",
      filename: "anim.gif",
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /invalid file type/i);
  } finally {
    server.close();
  }
});

test("accepts valid JPEG/PNG/WEBP uploads under the limit", async () => {
  const server = await startServer();
  const { port } = server.address();
  try {
    for (const mimetype of ALLOWED_AVATAR_MIME_TYPES) {
      const ext = mimetype.split("/")[1];
      const res = await uploadFile(`http://127.0.0.1:${port}/avatar`, {
        bytes: 2048,
        mimetype,
        filename: `avatar.${ext}`,
      });
      assert.strictEqual(res.status, 200, `expected ${mimetype} to be accepted`);
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.size, 2048);
    }
  } finally {
    server.close();
  }
});
