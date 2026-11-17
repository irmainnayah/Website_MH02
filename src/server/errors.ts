// Server-side error type shared by every layer. Dependency-free on purpose (unit-tested with Node).
// NOTE: only "erasable" TypeScript syntax is used in src/server pure modules (no parameter
// properties, enums or namespaces) so they can also run under Node's type stripping in tests.

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  headers: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    headers?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers ?? {};
  }
}

/**
 * Name of the violated constraint/index from a SQL Server error message, or null.
 * Only the NAME is returned (never the rejected values), so it is safe to write to a server log.
 */
export function constraintNameFromMessage(message: string): string | null {
  const m = /(?:constraint|index)\s+["']([A-Za-z0-9_]+)["']/i.exec(message);
  return m ? m[1] : null;
}

export const err = {
  badRequest: (code: string, message: string, details?: unknown) => new ApiError(400, code, message, details),
  unauthorized: (message = "Authentication required.") => new ApiError(401, "UNAUTHENTICATED", message),
  forbidden: (code = "FORBIDDEN", message = "You are not allowed to do this.") => new ApiError(403, code, message),
  notFound: (message = "Not found.") => new ApiError(404, "NOT_FOUND", message),
  conflict: (code: string, message: string, details?: unknown) => new ApiError(409, code, message, details),
  unprocessable: (code: string, message: string, details?: unknown) => new ApiError(422, code, message, details),
  unavailable: (code: string, message: string, retryAfterSeconds = 2) =>
    new ApiError(503, code, message, undefined, { "Retry-After": String(retryAfterSeconds) }),
};
