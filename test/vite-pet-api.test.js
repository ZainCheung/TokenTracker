const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

async function request(middleware, pathname, { method = "GET" } = {}) {
  const req = Readable.from([]);
  req.method = method;
  req.url = pathname;
  req.headers = { host: "localhost:5173" };
  const headers = {};
  let statusCode = 200;
  let nextCalled = false;
  const result = await new Promise((resolve, reject) => {
    const res = {
      setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
      writeHead(code, values = {}) {
        statusCode = code;
        Object.entries(values).forEach(([name, value]) => this.setHeader(name, value));
      },
      end(body = "") { resolve({ body: String(body), headers, statusCode }); },
    };
    middleware(req, res, (error) => {
      if (error) reject(error);
      else {
        nextCalled = true;
        resolve({ body: "", headers, statusCode });
      }
    });
  });
  return { ...result, nextCalled };
}

test("Vite dev server handles the current repo pet API instead of an installed CLI", async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "tokentracker-vite-pet-api-"));
  process.env.TOKENTRACKER_PETS_DIR = path.join(sandbox, "pets");
  try {
    const configUrl = `${pathToFileURL(path.join(repoRoot, "dashboard/vite.config.js")).href}?pet-api-test=${Date.now()}`;
    const { default: createConfig } = await import(configUrl);
    const config = createConfig({ mode: "development" });
    const plugin = config.plugins.find((item) => item?.name === "tokentracker-local-data-api");
    let middleware;
    plugin.configureServer({ middlewares: { use(value) { middleware = value; } } });

    const auth = await request(middleware, "/api/local-auth");
    assert.equal(auth.nextCalled, false);
    assert.equal(auth.statusCode, 200);
    assert.match(JSON.parse(auth.body).token, /^[a-f0-9]{48}$/);

    const pets = await request(middleware, "/functions/tokentracker-pets");
    assert.equal(pets.nextCalled, false);
    assert.equal(pets.statusCode, 200);
    assert.deepEqual(JSON.parse(pets.body), { pets: [] });

    const upload = await request(middleware, "/api/pets/import", { method: "POST" });
    assert.equal(upload.nextCalled, false);
    assert.equal(upload.statusCode, 401);
    assert.equal(JSON.parse(upload.body).error, "Unauthorized");
  } finally {
    delete process.env.TOKENTRACKER_PETS_DIR;
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
