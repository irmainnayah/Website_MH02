// Device master writes (.NET backend through the development proxy). Register: every signed-in user (own Site).
// Edit / Archive: Super Admin only. There is no hard delete: "hapus" = Arsipkan (history is kept).

export interface DeviceWriteResult {
  deviceId: string;
  deviceCode: string;
  serialNumber: string;
  siteId: number;
  rowVersion: string;
}

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Sesi login diperlukan.",
  SUPERADMIN_ONLY: "Hanya Superadmin yang dapat melakukan ini.",
  SITE_FORBIDDEN: "Anda tidak dapat menambah device untuk site ini.",
  SITE_REQUIRED: "Site wajib dipilih.",
  SITE_INACTIVE: "Site tidak tersedia atau sudah nonaktif.",
  VALIDATION_FAILED: "Periksa kembali data device.",
  DEVICE_CODE_EXISTS: "Kode device sudah digunakan.",
  SERIAL_EXISTS: "Nomor seri sudah terdaftar pada device lain.",
  STALE_VERSION: "Data device sudah diubah orang lain. Muat ulang lalu coba lagi.",
  DEVICE_ARCHIVED: "Device sudah diarsipkan dan tidak dapat diubah.",
  DEVICE_ALREADY_ARCHIVED: "Device sudah diarsipkan.",
  DEVICE_IN_USE: "Device yang sedang terpasang (In Use) tidak dapat diarsipkan. Lakukan Removal terlebih dahulu.",
  IDEMPOTENCY_KEY_REUSED: "Permintaan ini sudah pernah dikirim dengan isi berbeda. Tutup form lalu coba lagi.",
  COMMIT_OUTCOME_UNKNOWN: "Hasil penyimpanan belum dapat dipastikan. Tekan Simpan lagi untuk mencoba kembali dengan aman.",
  BACKEND_UNAVAILABLE: "Backend tidak tersedia.",
  DATABASE_UNAVAILABLE: "Database tidak tersedia.",
  NOT_FOUND: "Device tidak ditemukan.",
};

async function send<T>(url: string, method: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code: string | undefined = data?.error?.code;
    throw new Error((code && MESSAGES[code]) || "Permintaan gagal. Silakan coba lagi.");
  }
  return data as T;
}

/** The same key must be reused when the user retries the same form, so a retry never registers a device twice. */
export function newIdempotencyKey(): string {
  return `dev-${crypto.randomUUID()}`.slice(0, 64);
}

export function createDevice(body: { siteId?: number; deviceCode: string; serialNumber: string; notes?: string }, key: string) {
  return send<DeviceWriteResult>("/api/dotnet/devices", "POST", body, { "Idempotency-Key": key });
}

export function updateDevice(deviceId: string, body: { rowVersion: string; deviceCode?: string; serialNumber?: string; notes?: string }) {
  return send<DeviceWriteResult>(`/api/dotnet/devices/${encodeURIComponent(deviceId)}`, "PATCH", body);
}

export function archiveDevice(deviceId: string, body: { rowVersion: string; reason?: string }) {
  return send<DeviceWriteResult>(`/api/dotnet/devices/${encodeURIComponent(deviceId)}/archive`, "POST", body);
}
