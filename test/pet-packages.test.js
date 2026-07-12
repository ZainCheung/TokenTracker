const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const pets = require("../src/lib/pet-packages");

let root;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "tokentracker-pets-test-"));
  process.env.TOKENTRACKER_PETS_DIR = root;
});
after(() => {
  delete process.env.TOKENTRACKER_PETS_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

function webpHeader(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function storeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, contents] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(contents);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function manifest(id, version = 1) {
  return Buffer.from(JSON.stringify({
    id,
    displayName: id === "v2-pet" ? "V2 Pet" : "V1 Pet",
    description: "A test pet package.",
    spritesheetPath: "spritesheet.webp",
    ...(version === 2 ? { spriteVersionNumber: 2 } : {}),
    kind: "creature",
  }));
}

test("validates V1 and V2 Codex atlas dimensions", () => {
  assert.equal(pets.validatePackageFiles(manifest("v1-pet"), webpHeader(1536, 1872)).manifest.spriteVersionNumber, 1);
  assert.equal(pets.validatePackageFiles(manifest("v2-pet", 2), webpHeader(1536, 2288)).manifest.spriteVersionNumber, 2);
  assert.throws(
    () => pets.validatePackageFiles(manifest("v2-pet", 2), webpHeader(1536, 1872)),
    /1536x2288/,
  );
  const explicitV1 = JSON.parse(manifest("v1-pet").toString("utf8"));
  explicitV1.spriteVersionNumber = 1;
  assert.throws(
    () => pets.validatePackageFiles(Buffer.from(JSON.stringify(explicitV1)), webpHeader(1536, 1872)),
    /must be 2 when provided/,
  );
});

test("imports and discovers an exact two-file standard package", async () => {
  const result = await pets.importPetZip(storeZip({
    "pet.json": manifest("v2-pet", 2),
    "spritesheet.webp": webpHeader(1536, 2288),
  }));
  assert.equal(result.id, "v2-pet");
  assert.equal(result.spriteVersionNumber, 2);
  assert.ok(fs.existsSync(path.join(root, "v2-pet", "pet.json")));
  assert.deepEqual(pets.listInstalledPets().map((pet) => pet.id), ["v2-pet"]);
});

test("rejects non-standard zip entries and reserved ids", async () => {
  await assert.rejects(
    pets.importPetZip(storeZip({
      "pet.json": manifest("extra-pet"),
      "spritesheet.webp": webpHeader(1536, 1872),
      "readme.txt": "unexpected",
    })),
    /only pet.json and spritesheet.webp/,
  );
  assert.throws(
    () => pets.validatePackageFiles(manifest("clawd"), webpHeader(1536, 1872)),
    /reserved/,
  );
});

test("parses only codex-pets.net detail and package URLs", () => {
  assert.equal(pets.petIdFromCodexPetsUrl("https://codex-pets.net/#/pets/samara-v2"), "samara-v2");
  assert.equal(pets.petIdFromCodexPetsUrl("https://codex-pets.net/api/pets/samara-v2/download"), "samara-v2");
  assert.throws(() => pets.petIdFromCodexPetsUrl("https://example.com/#/pets/samara-v2"), /Only/);
});

test("accepts pre-kind manifests and unknown future kinds (codex-pets.net legacy packages)", async () => {
  const legacy = JSON.parse(manifest("nimbus-like").toString("utf8"));
  delete legacy.kind;
  const result = await pets.importPetZip(storeZip({
    "pet.json": Buffer.from(JSON.stringify(legacy)),
    "spritesheet.webp": webpHeader(1536, 1872),
  }));
  assert.equal(result.id, "nimbus-like");
  assert.equal("kind" in result, false);
  const installed = JSON.parse(fs.readFileSync(path.join(root, "nimbus-like", "pet.json"), "utf8"));
  assert.equal("kind" in installed, false);
  assert.ok(pets.listInstalledPets().some((pet) => pet.id === "nimbus-like"));

  const future = { ...legacy, id: "future-kind", kind: "mecha-golem" };
  const futureResult = pets.validatePackageFiles(Buffer.from(JSON.stringify(future)), webpHeader(1536, 1872));
  assert.equal(futureResult.manifest.kind, "mecha-golem");
  assert.throws(
    () => pets.validatePackageFiles(
      Buffer.from(JSON.stringify({ ...legacy, id: "bad-kind", kind: "Not A Slug!" })),
      webpHeader(1536, 1872),
    ),
    /kind must be a short lowercase label/,
  );
});
