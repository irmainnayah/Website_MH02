import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { api } from "@/server/http";
import { openPhoto } from "@/server/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams the file after the Site check (cross-Site or unknown = 404). Never served from a public folder.
export const GET = api("user", async (c) => {
  const file = await openPhoto(c.user, c.params.photoId);
  const body = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
