// Route factories for the four transaction endpoints, so each route file stays a few lines long.

import type { ZodType } from "zod";
import { api, json, readJson, readQuery } from "./http.ts";
import { parseTransactionRequest } from "./multipart.ts";
import type { PhotoInput } from "./photos.ts";
import { readIdempotencyKey } from "./idempotency.ts";
import { err } from "./errors.ts";
import { deleteActivity, editActivity, getActivity, listActivities } from "./transactions.ts";
import {
  activityListQuery,
  editInstallationSchema,
  editRemovalSchema,
  editReplacementSchema,
  editTroubleshootSchema,
  uuidParam,
} from "./validators.ts";
import type { ActivityType } from "./formNumber.ts";
import type { IdempotentResult } from "./idempotency.ts";
import type { ActivityDto } from "./transactions.ts";
import type { ServiceCtx } from "./devices.ts";

type Creator<I> = (ctx: ServiceCtx, input: I, key: string, photos: PhotoInput[]) => Promise<IdempotentResult<ActivityDto>>;

/** GET list + POST create (idempotent) for one transaction type. */
export function collectionRoutes<I>(type: ActivityType, schema: ZodType<I>, create: Creator<I>) {
  return {
    GET: api("user", async (c) => {
      const query = readQuery(c.req, activityListQuery);
      return json(await listActivities(c.user, { ...query, type }));
    }),
    POST: api("user", async (c) => {
      const key = readIdempotencyKey(c.req);
      // JSON (no photos) or multipart/form-data (`payload` + `photo:<slot>` files), design 7.
      const { input, photos } = await parseTransactionRequest(c.req, schema);
      const result = await create({ user: c.user, requestId: c.requestId, ip: c.ip }, input, key, photos);
      return json(result.data, result.replayed ? 200 : 201, result.replayed ? { "Idempotency-Replayed": "true" } : undefined);
    }),
  };
}

const EDIT_SCHEMAS = {
  installation: editInstallationSchema,
  replacement: editReplacementSchema,
  removal: editRemovalSchema,
  troubleshoot: editTroubleshootSchema,
} as const;

/** GET one + PATCH + DELETE (Super Admin only for the last two) for one transaction type. */
export function itemRoutes(type: ActivityType) {
  const parseId = (raw: string) => {
    const parsed = uuidParam.safeParse(raw);
    if (!parsed.success) throw err.notFound();
    return parsed.data;
  };
  return {
    GET: api("user", async (c) => {
      const activity = await getActivity(c.user, parseId(c.params.id));
      if (!activity || activity.activityType !== type) throw err.notFound();
      return json(activity);
    }),
    PATCH: api("superadmin", async (c) => {
      const id = parseId(c.params.id);
      const existing = await getActivity(c.user, id);
      if (!existing || existing.activityType !== type) throw err.notFound();
      const patch = await readJson(c.req, EDIT_SCHEMAS[type] as unknown as ZodType<{ rowVersion: string } & Record<string, unknown>>);
      return json(await editActivity({ user: c.user, requestId: c.requestId, ip: c.ip }, type, id, patch));
    }),
    DELETE: api("superadmin", async (c) => {
      const id = parseId(c.params.id);
      const activity = await getActivity(c.user, id);
      if (!activity || activity.activityType !== type) throw err.notFound();
      return json(await deleteActivity({ user: c.user, requestId: c.requestId, ip: c.ip }, id));
    }),
  };
}
