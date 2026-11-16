import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a stored minute-based duration into a readable Indonesian format.
 * Returns "—" when the value is null, undefined, or zero.
 *
 * Examples:
 *   30  → "0 jam 30 menit"
 *   90  → "1 jam 30 menit"
 *   120 → "2 jam 0 menit"
 *   330 → "5 jam 30 menit"
 *   900 → "15 jam 0 menit"
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const days = Math.floor(minutes / 1440);
  const remainingMinutes = minutes % 1440;
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} Hari`);
  if (hours > 0) parts.push(`${hours} Jam`);
  if (mins > 0 || (days === 0 && hours === 0)) parts.push(`${mins} Menit`);
  return parts.join(" ");
}

export interface WorkDurationResult {
  formatted: string;
  minutes: number;
  isValid: boolean;
}

/**
 * Normalizes an input string to YYYY-MM-DDTHH:mm
 * Handles:
 * - YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
 * - YYYY-MM-DD HH:mm
 * - HH:mm (appends fallbackDate or today's date)
 */
export function normalizeToDateTimeString(
  input?: string,
  fallbackDate?: string
): string {
  if (!input) return "";
  const trimmed = input.trim();
  // Already in full datetime format
  if (trimmed.includes("T")) {
    return trimmed.slice(0, 16);
  }
  if (trimmed.includes(" ") && trimmed.length >= 16) {
    return trimmed.replace(" ", "T").slice(0, 16);
  }
  // If it's HH:mm
  if (trimmed.includes(":")) {
    const baseDate = fallbackDate || new Date().toISOString().slice(0, 10);
    return `${baseDate}T${trimmed.slice(0, 5)}`;
  }
  return trimmed;
}

/**
 * Calculates work duration between start and finish datetime strings.
 * Supports:
 * - Same day (e.g. 2026-11-10T08:00 to 2026-11-10T12:30)
 * - Overnight / across midnight (e.g. 2026-11-10T22:00 to 2026-11-11T02:30)
 * - Multi-day (> 24 hours)
 * - Legacy format (HH:mm) with optional fallback date
 */
export function calculateWorkDuration(
  startStr?: string,
  endStr?: string,
  fallbackDate?: string
): WorkDurationResult {
  if (!startStr || !endStr) {
    return { formatted: "-", minutes: 0, isValid: false };
  }

  const startIso = normalizeToDateTimeString(startStr, fallbackDate);
  const endIso = normalizeToDateTimeString(endStr, fallbackDate);

  const startDate = new Date(startIso);
  const endDate = new Date(endIso);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { formatted: "-", minutes: 0, isValid: false };
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes <= 0) {
    return {
      formatted: "Finish Date & Time harus lebih besar dari Start Date & Time",
      minutes: 0,
      isValid: false,
    };
  }

  const days = Math.floor(diffMinutes / 1440);
  const remainingMinutes = diffMinutes % 1440;
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} Hari`);
  if (hours > 0) parts.push(`${hours} Jam`);
  if (mins > 0 || (days === 0 && hours === 0)) parts.push(`${mins} Menit`);

  return {
    formatted: parts.join(" "),
    minutes: diffMinutes,
    isValid: true,
  };
}

/**
 * Formats start and finish datetime for detail and display views.
 * Examples:
 * - "2026-11-10T22:00" & "2026-11-11T02:30" → "10 Nov 2026, 22:00 – 11 Nov 2026, 02:30"
 * - "2026-11-10T08:00" & "2026-11-10T11:30" → "10 Nov 2026, 08:00 – 11:30"
 * - "08:30" & "10:45" (legacy) → "08:30 – 10:45"
 */
export function formatDateTimeRange(
  startStr?: string,
  endStr?: string,
  baseDate?: string
): string {
  if (!startStr && !endStr) return "-";
  if (!startStr) return endStr || "-";
  if (!endStr) return startStr || "-";

  // If purely HH:mm without date info
  if (!startStr.includes("T") && !startStr.includes("-") && !endStr.includes("T") && !endStr.includes("-")) {
    return `${startStr} – ${endStr}`;
  }

  const startIso = normalizeToDateTimeString(startStr, baseDate);
  const endIso = normalizeToDateTimeString(endStr, baseDate);
  const sDate = new Date(startIso);
  const eDate = new Date(endIso);

  if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
    return `${startStr} – ${endStr}`;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const formatTime = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const formatDate = (d: Date) => `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;

  const sameDay = sDate.toDateString() === eDate.toDateString();
  if (sameDay) {
    return `${formatDate(sDate)}, ${formatTime(sDate)} – ${formatTime(eDate)}`;
  } else {
    return `${formatDate(sDate)}, ${formatTime(sDate)} – ${formatDate(eDate)}, ${formatTime(eDate)}`;
  }
}

/**
 * Smoothly scrolls the viewport to the validation summary error banner.
 * Works whether the scrolling container is window or the layout's <main> element.
 */
export function scrollToErrorSummary(elementRef?: React.RefObject<HTMLElement | null>) {
  if (typeof window === "undefined") return;
  setTimeout(() => {
    if (elementRef?.current) {
      elementRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      const banner = document.querySelector('[data-error-summary="true"]') || document.querySelector("main");
      if (banner && "scrollIntoView" in banner) {
        banner.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const main = document.querySelector("main");
        if (main) {
          main.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    }
  }, 50);
}
