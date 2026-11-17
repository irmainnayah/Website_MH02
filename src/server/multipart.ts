// Transaction request bodies: plain JSON (no photos) or multipart/form-data (design 7):
//   payload          the JSON text of the transaction (same strict schema as the JSON body)
//   photo:<slot>     a file for slot <slot> (jpeg/png/webp), e.g. photo:mh02_installed
//   caption:<slot>   optional caption of that photo

import type { ZodType } from "zod";
import { getConfig } from "./config.ts";
import { err } from "./errors.ts";
import { MAX_PHOTOS_PER_TRANSACTION } from "./photos.ts";
import type { PhotoInput } from "./photos.ts";

export interface ParsedTransactionRequest<I> {
  input: I;
  photos: PhotoInput[];
}

const PHOTO_PREFIX = "photo:";
const CAPTION_PREFIX = "caption:";

export function isMultipart(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().startsWith("multipart/form-data");
}

export async function parseTransactionRequest<I>(req: Request, schema: ZodType<I>): Promise<ParsedTransactionRequest<I>> {
  if (!isMultipart(req.headers.get("content-type"))) {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw err.badRequest("INVALID_JSON", "The request body must be valid JSON.");
    }
    return { input: schema.parse(raw), photos: [] };
  }
  // Refuse an oversized body before reading it (a declared length is only a hint; each file is checked again).
  const max = getConfig().photo.maxBytes * MAX_PHOTOS_PER_TRANSACTION + 1_048_576;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) throw err.badRequest("REQUEST_TOO_LARGE", "The request is too large.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw err.badRequest("INVALID_MULTIPART", "The multipart body could not be read.");
  }
  const payload = form.get("payload");
  if (typeof payload !== "string") throw err.badRequest("PAYLOAD_REQUIRED", 'A "payload" field with the JSON text is required.');
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    throw err.badRequest("INVALID_JSON", "The payload field must be valid JSON.");
  }
  const input = schema.parse(raw);

  const captions = new Map<string, string>();
  const photos: PhotoInput[] = [];
  for (const [name, value] of form.entries()) {
    if (name === "payload") continue;
    if (name.startsWith(CAPTION_PREFIX) && typeof value === "string") {
      captions.set(name.slice(CAPTION_PREFIX.length), value);
    } else if (name.startsWith(PHOTO_PREFIX) && typeof value !== "string") {
      const file = value as File;
      if (file.size > getConfig().photo.maxBytes) {
        throw err.badRequest("PHOTO_TOO_LARGE", `Photo "${name.slice(PHOTO_PREFIX.length)}" is larger than ${getConfig().photo.maxBytes} bytes.`);
      }
      photos.push({ slotKey: name.slice(PHOTO_PREFIX.length), filename: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    } else {
      throw err.badRequest("UNKNOWN_FORM_FIELD", `Unexpected form field "${name}".`);
    }
  }
  for (const [slot] of captions) {
    if (!photos.some((p) => p.slotKey === slot)) throw err.badRequest("CAPTION_WITHOUT_PHOTO", `Caption for "${slot}" has no photo.`);
  }
  for (const p of photos) p.caption = captions.get(p.slotKey) ?? null;
  return { input, photos };
}
