"use client";

import React, { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const [nrp, setNrp] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"credentials" | "setup" | "verify">("credentials");
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = nrp.trim();
    if (!/^[pPlL][A-Za-z0-9._-]{1,29}$/.test(username) ||
        username[0].toLowerCase() !== (username.slice(1).toUpperCase().startsWith("JI") ? "l" : "p")) {
      setError("Gunakan L untuk NRP berawalan JI, atau p untuk NRP lainnya.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dotnet/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nrp: username }),
      });
      if (!response.ok) {
        const result: { error?: { code?: string } } | null = await response.json().catch(() => null);
        const messages: Record<string, string> = {
          LDAP_UNAVAILABLE: "Layanan LDAP tidak tersedia. Periksa koneksi dan sertifikat LDAPS.",
          DATABASE_UNAVAILABLE: "Database tidak tersedia. Periksa koneksi database backend.",
          BACKEND_UNAVAILABLE: "Backend tidak tersedia. Pastikan API berjalan.",
          ACCOUNT_LOCKED: "Akun terkunci sementara. Coba lagi nanti.",
          INVALID_CREDENTIALS: "Akun tidak tersedia.",
          RATE_LIMITED: "Terlalu banyak permintaan. Coba lagi nanti.",
          NO_SITE_ASSIGNED: "Akun tidak memiliki role atau site yang valid.",
        };
        setError(messages[result?.error?.code ?? ""] ?? (response.status === 401 ? "Akun tidak tersedia." : "Tidak dapat masuk. Periksa koneksi backend."));
        return;
      }
      const result: { mfaRequired?: boolean; setupRequired?: boolean } = await response.json();
      if (!result.mfaRequired) {
        setError("Verifikasi Authenticator tidak tersedia.");
        return;
      }
      if (result.setupRequired) {
        const setupResponse = await fetch("/api/dotnet/auth/mfa/setup", { cache: "no-store" });
        if (!setupResponse.ok) {
          setError("Pendaftaran Authenticator tidak tersedia. Coba masuk kembali.");
          return;
        }
        const setup: { qrCode: string } = await setupResponse.json();
        setQrCode(setup.qrCode);
        setStep("setup");
      } else {
        setStep("verify");
      }
    } catch {
      setError("Tidak dapat masuk. Periksa koneksi backend.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[0-9]{6}$/.test(code)) { setError("Masukkan kode 6 digit."); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dotnet/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        const result: { error?: { code?: string } } | null = await response.json().catch(() => null);
        if (result?.error?.code === "MFA_EXPIRED") {
          setStep("credentials"); setQrCode(""); setCode("");
          setError("Sesi verifikasi berakhir. Silakan masuk kembali.");
        } else {
          setError(result?.error?.code === "MFA_INVALID" ? "Kode Authenticator tidak valid." : "Verifikasi Authenticator tidak tersedia.");
        }
        return;
      }
      setCode(""); setQrCode("");
      if (!await refreshSession()) { setError("Sesi tidak dapat diverifikasi. Coba lagi."); return; }
      router.push("/");
    } catch {
      setError("Verifikasi Authenticator tidak tersedia.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-sm bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <p className="text-xs font-semibold text-blue-700">SMARTD DISPLAY</p>
        <h1 className="text-xl font-bold text-slate-900 mt-1">Asset Report</h1>
        {step === "credentials" ? <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Username
            <input autoComplete="username" required maxLength={30} value={nrp} onChange={(event) => setNrp(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Memproses..." : "Masuk"}</button>
        </form> : <form onSubmit={verify} className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">{step === "setup" ? "Pendaftaran Authenticator" : "Verifikasi Authenticator"}</h2>
          {step === "setup" && qrCode && <div className="flex justify-center"><img src={qrCode} alt="QR pendaftaran Authenticator" width={220} height={220} /></div>}
          <label className="block text-sm font-medium text-slate-700">Kode Authenticator
            <input autoComplete="one-time-code" inputMode="numeric" required maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Memproses..." : "Verifikasi"}</button>
          <button type="button" disabled={loading} onClick={() => { setStep("credentials"); setQrCode(""); setCode(""); setError(""); }} className="w-full text-sm text-slate-500">Kembali</button>
        </form>}
      </section>
    </main>
  );
}