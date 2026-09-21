import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readdir, rm, stat, symlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { ApiError } from "../src/lib/api-errors";
import { MAX_PHOTO_BYTES, photoFilePath, processPhoto, readPhotoFile, readPhotoUploads, removePhotoFiles, safeOriginalName, storePhotoFiles } from "../src/lib/photos";

test("photos are resized, oriented, and stripped of EXIF", async () => {
  const source = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#557755" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const photo = await processPhoto(source, "../../camera.jpg");
  assert.equal(photo.originalName, "camera.jpg");
  assert.equal(photo.width, 800);
  assert.equal(photo.height, 1600);
  const metadata = await sharp(photo.data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test("image decoding rejects malformed, active, or oversized uploads", async () => {
  for (const input of [Buffer.from("not a jpeg"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), Buffer.alloc(0)]) {
    await assert.rejects(processPhoto(input, "image.jpg"), (error) => error instanceof ApiError && error.status === 400);
  }
  await assert.rejects(processPhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1), "too-big.jpg"),
    (error) => error instanceof ApiError && error.status === 413);
});

test("stored filenames are generated identifiers, not original paths", async () => {
  const parent = resolve(".test-data");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "photo-unit-"));
  try {
    const input = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#557755" } }).png().toBuffer();
    const photo = await processPhoto(input, "..\\private\\device.png");
    const [stored] = await storePhotoFiles([photo], directory);
    assert.match(stored.filename, /^[a-f0-9-]{36}\.webp$/);
    assert.equal(stored.originalName, "device.png");
    assert.deepEqual(await readPhotoFile(stored.filename, directory), photo.data);
    assert.equal((await stat(photoFilePath(stored.filename, directory))).mode & 0o777, 0o600);
    const linkName = `${randomUUID()}.webp`;
    await symlink(photoFilePath(stored.filename, directory), photoFilePath(linkName, directory));
    await assert.rejects(readPhotoFile(linkName, directory));
    await removePhotoFiles([stored.filename, linkName], undefined, directory);
    await removePhotoFiles([stored.filename], undefined, directory);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  assert.equal(safeOriginalName("../unsafe/\u0000photo.png"), "photo.png");
  for (const name of ["../../.env", "a.webp", "/tmp/photo.webp", "ABC.webp"]) assert.throws(() => photoFilePath(name));
});

test("multipart uploads require files and reject text or unexpected fields", async () => {
  for (const [key, value] of [["files", "not a file"], ["surprise", "value"]]) {
    const form = new FormData();
    form.append(key, value);
    const request = new Request("http://localhost/api/items/id/photos", { method: "POST", body: form });
    await assert.rejects(readPhotoUploads(request), (error) => error instanceof ApiError && error.status === 400);
  }
  const source = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const form = new FormData();
  form.append("files", new File([new Uint8Array(source)], "photo.png", { type: "image/png" }));
  const files = await readPhotoUploads(new Request("http://localhost/api/items/id/photos", { method: "POST", body: form }));
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "photo.png");
});
