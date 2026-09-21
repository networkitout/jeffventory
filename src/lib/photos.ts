import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  ApiError,
  assertMutationRequest,
  errorCode,
  logUnexpectedError,
  readBoundedBody,
} from "@/lib/api-errors";

export const MAX_PHOTOS_PER_ITEM = 8;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_PHOTOS_PER_ITEM * MAX_PHOTO_BYTES + 128 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_PHOTO_DIMENSION = 1600;

export type ProcessedPhoto = {
  data: Buffer;
  originalName: string;
  width: number;
  height: number;
};

export type StoredPhoto = Omit<ProcessedPhoto, "data"> & { filename: string };

export function uploadDirectory(): string {
  // User data is read at runtime, never traced into a deployable server bundle.
  return resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || "data/uploads");
}

export function photoFilePath(filename: string, directory = uploadDirectory()): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(filename)) {
    throw new Error("Invalid stored photo filename.");
  }
  return resolve(directory, filename);
}

export function safeOriginalName(name: string): string {
  // A display label only, never used to build a filesystem path.
  return (name.split(/[\\/]/).at(-1) ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, 255) || "photo";
}

export async function readPhotoUploads(request: Request): Promise<File[]> {
  assertMutationRequest(request, "multipart/form-data");
  const bytes = await readBoundedBody(request, MAX_UPLOAD_BYTES);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new ApiError(400, "Request must contain valid multipart form data.");
  }
  if ([...form.keys()].some((key) => key !== "files")) {
    throw new ApiError(400, "Upload images using the files form field.");
  }
  const files = form.getAll("files");
  if (files.length === 0 || files.length > MAX_PHOTOS_PER_ITEM) {
    throw new ApiError(400, `Upload between 1 and ${MAX_PHOTOS_PER_ITEM} photos at a time.`);
  }
  if (files.some((file) => typeof file === "string")) {
    throw new ApiError(400, "Each files field must contain an image file.");
  }
  for (const file of files as File[]) {
    if (file.size === 0) throw new ApiError(400, "Empty image files are not supported.");
    if (file.size > MAX_PHOTO_BYTES) throw new ApiError(413, "Each photo must be 10 MB or smaller.");
  }
  return files as File[];
}

export async function processPhoto(data: Buffer, originalName: string): Promise<ProcessedPhoto> {
  if (data.length === 0) throw new ApiError(400, "Empty image files are not supported.");
  if (data.length > MAX_PHOTO_BYTES) throw new ApiError(413, "Each photo must be 10 MB or smaller.");
  try {
    const image = sharp(data, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
      throw new ApiError(400, "Photos must be JPEG, PNG, or WebP images.");
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new ApiError(400, "Animated or multi-page images are not supported.");
    }
    const result = await image
      .rotate()
      .resize({
        width: MAX_PHOTO_DIMENSION,
        height: MAX_PHOTO_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    // Sharp removes EXIF, ICC, XMP and other metadata unless explicitly retained.
    return {
      data: result.data,
      originalName: safeOriginalName(originalName),
      width: result.info.width,
      height: result.info.height,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // These failures are untrusted-image decode errors, not server failures.
    throw new ApiError(400, "Photo could not be decoded. Use a valid JPEG, PNG, or WebP under 40 megapixels.");
  }
}

export async function removePhotoFiles(
  filenames: readonly string[],
  failureMessage = "Photo cleanup failed. Check server logs.",
  directory = uploadDirectory(),
): Promise<void> {
  let failed = false;
  for (const filename of filenames) {
    try {
      await unlink(photoFilePath(filename, directory));
    } catch (error) {
      // An already-absent file is the desired state, including retried cleanup.
      if (errorCode(error) === "ENOENT") continue;
      failed = true;
      logUnexpectedError("photo file cleanup", error);
      // Only generated identifiers are logged, never original names or paths.
      if (/^[0-9a-f-]+\.webp$/.test(filename)) {
        console.error("[photo file cleanup] Could not remove stored file", { filename });
      }
    }
  }
  if (failed) throw new ApiError(500, failureMessage);
}

export async function storePhotoFiles(
  photos: readonly ProcessedPhoto[],
  directory = uploadDirectory(),
): Promise<StoredPhoto[]> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stored: StoredPhoto[] = [];
  try {
    for (const photo of photos) {
      const filename = `${randomUUID()}.webp`;
      const handle = await open(photoFilePath(filename, directory), "wx", 0o600);
      // Track as soon as exclusive creation succeeds, even if writing later fails.
      // Never remove a pre-existing file on an EEXIST collision.
      stored.push({
        filename, originalName: photo.originalName, width: photo.width, height: photo.height,
      });
      try {
        await handle.writeFile(photo.data);
      } finally {
        await handle.close();
      }
    }
    return stored;
  } catch (error) {
    await removePhotoFiles(
      stored.map((photo) => photo.filename),
      "Upload failed and temporary photo cleanup failed. Check server logs.",
      directory,
    );
    throw error;
  }
}

export async function readPhotoFile(filename: string, directory = uploadDirectory()): Promise<Buffer> {
  // Do not follow a filesystem symlink, even if a database was edited externally.
  const handle = await open(photoFilePath(filename, directory), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_PHOTO_BYTES) throw new Error("Invalid stored photo file.");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
