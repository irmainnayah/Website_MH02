// src/lib/mock-data/installations.ts
import {
  InstallationRecord,
  InstallationPhoto,
  InstallationShift,
  SourcePowerType,
  PhotoSlotKey,
} from "@/types/installation";
import { DistrictName, DeviceRecord } from "@/types/dashboard";
import { devices } from "./devices";

/**
 * ⚠️ DEMO ONLY — MOCK DATA
 * Daftar nama Group Leader (GL) penanggung jawab operasional lapangan.
 * Sesuai aturan acuan: GL dicatat HANYA sebagai opsi dropdown penanggung jawab,
 * BUKAN sebagai entitas approval fiktif.
 */
export const GROUP_LEADERS: string[] = [
  "Agus Setiawan (GL)",
  "Bambang Hermanto (GL)",
  "Rudi Hartono (GL)",
  "Hendra Wijaya (GL)",
  "Surya Pratama (GL)",
];

/**
 * Daftar Teknisi Pelaksana Pemasangan Perangkat
 */
export const TECHNICIANS: { name: string; nrp: string }[] = [
  { name: "Ahmad Rizki", nrp: "NRP-772104" },
  { name: "Dedi Supriyadi", nrp: "NRP-772188" },
  { name: "Hendro Wibowo", nrp: "NRP-773012" },
  { name: "Fauzan Aditya", nrp: "NRP-774520" },
  { name: "Fajar Pratama", nrp: "NRP-773409" },
  { name: "Budi Santoso", nrp: "NRP-771092" },
];

/**
 * Pilihan Shift Operasional
 */
export const SHIFT_OPTIONS: InstallationShift[] = ["Shift 1", "Shift 2"];

/**
 * Pilihan Sumber Catu Daya (Source Power)
 */
export const SOURCE_POWER_OPTIONS: SourcePowerType[] = [
  "Stand By",
  "Acc On",
  "Standby PDU",
];

/**
 * ⚠️ SIMULASI / PERLU KONFIRMASI:
 * Daftar versi firmware SPM (Smart Power Module / System Parameter Module).
 * Diperbarui sesuai arahan: Menambahkan opsi "Non SPM".
 */
export const SPM_VERSIONS: string[] = [
  "Non SPM",
  "v1.0.0",
  "v1.2.4 (Stable)",
  "v2.0.1",
  "v2.1.0 (Latest)",
];

/**
 * ⚠️ SIMULASI / PERLU KONFIRMASI:
 * Daftar Area operasional per distrik tambang.
 */
export const AREAS_BY_DISTRICT: Record<DistrictName, string[]> = {
  Sangatta: [
    "Workshop Main Pit Sangatta",
    "Pit 1 North Yard",
    "Pit 2 South Yard",
    "Hauling Road KM 12",
    "Disposal West Area",
  ],
  Bengalon: [
    "Pit B South Workshop",
    "Bengalon Central Yard",
    "Hauling Road Bengalon KM 05",
    "Port Area Bengalon",
  ],
  Wahau: [
    "Field Bay Area Wahau",
    "Pit Wahau East",
    "Workshop Wahau KM 02",
    "Disposal Alpha",
  ],
  "Head Office": [],

  "Sangatta Utara": [
    "North Workshop Bay 1",
    "Pit North Prima",
    "Heavy Yard Sangatta Utara",
    "Bay 3 Sangatta Utara",
  ],
};

/**
 * SVG Mock Demonstrasi 4 Slot Foto Dokumentasi Pemasangan
 * (Non-confidential illustrative diagrams untuk preview & zoom lightbox)
 */
export const DEMO_PHOTO_SLOTS: Record<
  PhotoSlotKey,
  { slotLabel: string; defaultCaption: string; svgDataUri: string }
> = {
  mh02_installed: {
    slotLabel: "1. SMARTD DISPLAY Setelah Terpasang",
    defaultCaption:
      "Unit perangkat telematika SMARTD DISPLAY terpasang kokoh pada braket kabin dengan penguncian anti-vibrasi.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#0f172a"/>
        <defs>
          <linearGradient id="bgBox" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>
          <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#2563eb"/>
            <stop offset="100%" stop-color="#38bdf8"/>
          </linearGradient>
        </defs>
        <!-- Enclosure Frame -->
        <rect x="120" y="70" width="360" height="230" rx="16" fill="url(#bgBox)" stroke="#334155" stroke-width="4"/>
        <rect x="140" y="90" width="320" height="190" rx="10" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
        <!-- Metal Brackets -->
        <rect x="95" y="110" width="25" height="150" rx="4" fill="#64748b"/>
        <rect x="480" y="110" width="25" height="150" rx="4" fill="#64748b"/>
        <circle cx="107" cy="130" r="5" fill="#0f172a"/>
        <circle cx="107" cy="240" r="5" fill="#0f172a"/>
        <circle cx="493" cy="130" r="5" fill="#0f172a"/>
        <circle cx="493" cy="240" r="5" fill="#0f172a"/>
        <!-- LED Indicators -->
        <circle cx="180" cy="130" r="8" fill="#22c55e"/>
        <text x="195" y="134" fill="#94a3b8" font-size="11" font-family="monospace">PWR</text>
        <circle cx="250" cy="130" r="8" fill="#3b82f6"/>
        <text x="265" y="134" fill="#94a3b8" font-size="11" font-family="monospace">GPS</text>
        <circle cx="320" cy="130" r="8" fill="#eab308"/>
        <text x="335" y="134" fill="#94a3b8" font-size="11" font-family="monospace">AIS</text>
        <circle cx="390" cy="130" r="8" fill="#10b981"/>
        <text x="405" y="134" fill="#94a3b8" font-size="11" font-family="monospace">NET</text>
        <!-- Center Plate -->
        <rect x="150" y="160" width="300" height="85" rx="8" fill="#090d16" stroke="#1d4ed8" stroke-width="2"/>
        <text x="300" y="200" fill="#f8fafc" font-size="18" font-weight="bold" font-family="sans-serif" text-anchor="middle">SMARTD DISPLAY</text>
        <text x="300" y="222" fill="#38bdf8" font-size="12" font-family="monospace" text-anchor="middle">STATUS: ACTIVE • IN USE</text>
        <!-- Footer Label -->
        <rect x="40" y="325" width="520" height="48" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
        <text x="300" y="348" fill="#f8fafc" font-size="14" font-weight="bold" font-family="sans-serif" text-anchor="middle">SLOT 1 • SMARTD DISPLAY SETELAH TERPASANG</text>
        <text x="300" y="363" fill="#94a3b8" font-size="11" font-family="sans-serif" text-anchor="middle">Unit Utama Terkunci pada Mounting Bracket Kabin Unit Armada</text>
      </svg>`),
  },
  camera_dashboard_angle: {
    slotLabel: "2. Posisi Kamera Dashboard & Angle View Camera",
    defaultCaption:
      "Kamera pengawas kabin terpasang presisi di tengah dashboard dengan sudut pandang driver & windshield bebas halangan.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#090d16"/>
        <!-- Dashboard Horizon & Windshield -->
        <path d="M40 260 L140 100 L460 100 L560 260 Z" fill="#1e293b" stroke="#334155" stroke-width="2"/>
        <!-- Road View Horizon -->
        <path d="M260 100 L240 260 L360 260 L340 100 Z" fill="#334155" opacity="0.6"/>
        <line x1="300" y1="100" x2="300" y2="260" stroke="#facc15" stroke-width="3" stroke-dasharray="8,8"/>
        <!-- Camera Body -->
        <rect x="260" y="190" width="80" height="50" rx="8" fill="#0f172a" stroke="#38bdf8" stroke-width="3"/>
        <circle cx="300" cy="215" r="16" fill="#1e293b" stroke="#0284c7" stroke-width="3"/>
        <circle cx="300" cy="215" r="8" fill="#0284c7"/>
        <circle cx="303" cy="212" r="3" fill="#ffffff" opacity="0.8"/>
        <!-- Vision Angle Cone -->
        <polygon points="300,190 120,60 480,60" fill="#38bdf8" opacity="0.15"/>
        <line x1="300" y1="190" x2="120" y2="60" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4,4"/>
        <line x1="300" y1="190" x2="480" y2="60" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4,4"/>
        <!-- Footer Label -->
        <rect x="40" y="325" width="520" height="48" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
        <text x="300" y="348" fill="#f8fafc" font-size="14" font-weight="bold" font-family="sans-serif" text-anchor="middle">SLOT 2 • KAMERA DASHBOARD &amp; ANGLE VIEW</text>
        <text x="300" y="363" fill="#94a3b8" font-size="11" font-family="sans-serif" text-anchor="middle">Field of View (FOV) Mencakup Sudut Pandang Kabin &amp; Area Depan</text>
      </svg>`),
  },
  nodered_config: {
    slotLabel: "2. SMARTD DISPLAY saat Konfigurasi & Dashboard Node-RED UI",
    defaultCaption:
      "Tangkapan layar konfigurasi commissioning Node-RED UI menunjukkan telemetri sinyal, CAN-bus, dan stream data aktif.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#18181b"/>
        <!-- Node-RED Topbar -->
        <rect x="40" y="40" width="520" height="35" rx="6" fill="#8f0000"/>
        <circle cx="60" cy="57" r="6" fill="#ffffff" opacity="0.8"/>
        <text x="75" y="62" fill="#ffffff" font-size="14" font-weight="bold" font-family="sans-serif">Node-RED SMARTD DISPLAY Dashboard UI</text>
        <text x="520" y="61" fill="#fecaca" font-size="11" font-family="monospace" text-anchor="end">LIVE STREAM: OK</text>
        <!-- Editor Canvas -->
        <rect x="40" y="75" width="520" height="235" fill="#27272a" stroke="#3f3f46" stroke-width="1"/>
        <!-- Flow Nodes -->
        <rect x="70" y="110" width="100" height="38" rx="6" fill="#d97706" stroke="#f59e0b" stroke-width="2"/>
        <text x="120" y="134" fill="#ffffff" font-size="12" font-weight="bold" font-family="sans-serif" text-anchor="middle">CAN VHMS In</text>
        <rect x="230" y="110" width="110" height="38" rx="6" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
        <text x="285" y="134" fill="#ffffff" font-size="12" font-weight="bold" font-family="sans-serif" text-anchor="middle">Parse Telemetry</text>
        <rect x="400" y="110" width="120" height="38" rx="6" fill="#16a34a" stroke="#4ade80" stroke-width="2"/>
        <text x="460" y="134" fill="#ffffff" font-size="12" font-weight="bold" font-family="sans-serif" text-anchor="middle">MQTT Broker Out</text>
        <!-- Wires -->
        <path d="M170 129 C200 129, 200 129, 230 129" fill="none" stroke="#e4e4e7" stroke-width="3"/>
        <path d="M340 129 C370 129, 370 129, 400 129" fill="none" stroke="#e4e4e7" stroke-width="3"/>
        <!-- Diagnostic Gauges in Node-RED -->
        <rect x="70" y="175" width="130" height="110" rx="8" fill="#18181b" stroke="#3f3f46"/>
        <text x="135" y="198" fill="#a1a1aa" font-size="11" font-family="sans-serif" text-anchor="middle">GPS Satellites</text>
        <text x="135" y="240" fill="#22c55e" font-size="28" font-weight="bold" font-family="monospace" text-anchor="middle">12 SAT</text>
        <text x="135" y="265" fill="#38bdf8" font-size="10" font-family="monospace" text-anchor="middle">HDOP: 0.9 (EXCELLENT)</text>
        <rect x="220" y="175" width="150" height="110" rx="8" fill="#18181b" stroke="#3f3f46"/>
        <text x="295" y="198" fill="#a1a1aa" font-size="11" font-family="sans-serif" text-anchor="middle">IP Network Status</text>
        <text x="295" y="228" fill="#f8fafc" font-size="11" font-family="monospace" text-anchor="middle">SMARTD: 192.168.1.102</text>
        <text x="295" y="248" fill="#94a3b8" font-size="11" font-family="monospace" text-anchor="middle">CPE : 192.168.1.1</text>
        <text x="295" y="268" fill="#4ade80" font-size="10" font-family="monospace" text-anchor="middle">PING: 4ms • CONNECTED</text>
        <rect x="390" y="175" width="130" height="110" rx="8" fill="#18181b" stroke="#3f3f46"/>
        <text x="455" y="198" fill="#a1a1aa" font-size="11" font-family="sans-serif" text-anchor="middle">SPM Firmware</text>
        <text x="455" y="240" fill="#38bdf8" font-size="24" font-weight="bold" font-family="monospace" text-anchor="middle">v1.2.4</text>
        <text x="455" y="265" fill="#22c55e" font-size="10" font-family="monospace" text-anchor="middle">STANDBY PDU OK</text>
        <!-- Footer Label -->
        <rect x="40" y="325" width="520" height="48" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
        <text x="300" y="348" fill="#f8fafc" font-size="14" font-weight="bold" font-family="sans-serif" text-anchor="middle">SLOT 2 • SMARTD DISPLAY KONFIGURASI &amp; NODE-RED UI</text>
        <text x="300" y="363" fill="#94a3b8" font-size="11" font-family="sans-serif" text-anchor="middle">Verifikasi Aliran Data Telemetri &amp; Konfigurasi Jaringan Berhasil</text>
      </svg>`),
  },
  gps_antenna: {
    slotLabel: "3. Posisi Antena GPS & GPS SMARTD DISPLAY",
    defaultCaption:
      "Antena GPS telematika eksternal terpasang di atas atap kabin dengan sudut elevasi terbuka tanpa halangan struktural.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#090d16"/>
        <!-- Vehicle Cabin Roof -->
        <rect x="60" y="220" width="480" height="70" rx="6" fill="#1e293b" stroke="#475569" stroke-width="3"/>
        <text x="300" y="260" fill="#64748b" font-size="14" font-weight="bold" font-family="sans-serif" text-anchor="middle">ATAP KABIN UNIT ALAT BERAT</text>
        <!-- Antenna Puck / Dome Base -->
        <path d="M230 220 L240 180 L360 180 L370 220 Z" fill="#0f172a" stroke="#38bdf8" stroke-width="3"/>
        <ellipse cx="300" cy="180" rx="60" ry="16" fill="#0284c7"/>
        <ellipse cx="300" cy="174" rx="40" ry="10" fill="#38bdf8"/>
        <!-- RF Cable Entry -->
        <path d="M300 220 L300 245" stroke="#ef4444" stroke-width="6" stroke-linecap="round"/>
        <!-- Satellite Signal Waves -->
        <path d="M200 130 A120 60 0 0 1 400 130" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="6,6"/>
        <path d="M160 90 A180 80 0 0 1 440 90" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="8,8" opacity="0.7"/>
        <path d="M120 50 A240 100 0 0 1 480 50" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="10,10" opacity="0.4"/>
        <text x="300" y="110" fill="#38bdf8" font-size="12" font-weight="bold" font-family="monospace" text-anchor="middle">GPS / GNSS L1/L2 SIGNAL LOCK</text>
        <!-- Footer Label -->
        <rect x="40" y="325" width="520" height="48" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
        <text x="300" y="348" fill="#f8fafc" font-size="14" font-weight="bold" font-family="sans-serif" text-anchor="middle">SLOT 3 • POSISI ANTENA GPS &amp; GPS SMARTD DISPLAY</text>
        <text x="300" y="363" fill="#94a3b8" font-size="11" font-family="sans-serif" text-anchor="middle">Pemasangan Kubah Antena GPS dengan Lapisan Sealant Tahan Cuaca</text>
      </svg>`),
  },
  // Aliases for backward compatibility
  unit_exterior: {
    slotLabel: "1. MH02 Setelah Terpasang",
    defaultCaption:
      "Unit perangkat telematika MH02 terpasang kokoh pada braket kabin.",
    svgDataUri: "", // populated below
  },
  module_position: {
    slotLabel: "2. Posisi Kamera Dashboard & Angle View Camera",
    defaultCaption:
      "Kamera pengawas kabin terpasang presisi di dashboard tengah.",
    svgDataUri: "", // populated below
  },
  wiring_power: {
    slotLabel: "3. MH02 saat Konfigurasi & Dashboard Node-RED UI",
    defaultCaption: "Tangkapan layar konfigurasi commissioning Node-RED UI.",
    svgDataUri: "", // populated below
  },
};

// Populate aliases
DEMO_PHOTO_SLOTS.unit_exterior.svgDataUri =
  DEMO_PHOTO_SLOTS.mh02_installed.svgDataUri;
DEMO_PHOTO_SLOTS.module_position.svgDataUri =
  DEMO_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri;
DEMO_PHOTO_SLOTS.wiring_power.svgDataUri =
  DEMO_PHOTO_SLOTS.nodered_config.svgDataUri;

/**
 * Dataset Awal Riwayat Pemasangan (Installation Records)
 */
export let initialInstallations: InstallationRecord[] = [
  {
    id: "INS-202610-001",
    date: "2026-10-18",
    installationTime: "08:30",
    startTime: "08:30",
    endTime: "10:45",
    durationFormatted: "2 Jam 15 Menit",
    durationMinutes: 135,
    deviceId: "D011",
    serialNumber: "SN011",
    unitNo: "DT-101",
    equipmentType: "Dump Truck",
    shift: "Shift 1",
    sourcePower: "Standby PDU",
    spmVersion: "v1.2.4 (Stable)",
    district: "Sangatta",
    area: "Workshop Main Pit Sangatta",
    locationDetail: "Bay 3 Heavy Workshop Pit Sangatta",
    ipAddress: "192.168.1.102",
    ipCpe: "192.168.1.1",
    ipVhms: "192.168.1.50",
    technicianName: "Ahmad Rizki",
    technicianNrp: "NRP-772104",
    groupLeaderName: "Agus Setiawan (GL)",
    status: "completed",
    remarks:
      "Instalasi unit MH02 pada unit armada Dump Truck DT-101 berjalan lancar. Modul aktif, sinyal GPS lock 12 satelit, dan Node-RED data stream terverifikasi normal.",
    notes:
      "Instalasi unit MH02 pada unit armada Dump Truck DT-101 berjalan lancar. Modul aktif, sinyal GPS lock 12 satelit, dan Node-RED data stream terverifikasi normal.",
    photos: [
      {
        slot: "mh02_installed",
        slotLabel: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel,
        url: DEMO_PHOTO_SLOTS.mh02_installed.svgDataUri,
        caption: "Unit MH02 terpasang kokoh pada kabin Dump Truck DT-101.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Kamera dashboard terpasang sentral dengan sudut FOV optimal.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Node-RED dashboard menunjukkan telemetri aktif dan IP 192.168.1.102 terhubung.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GPS terpasang rapi di atap kabin dengan sealant tahan getaran.",
      },
    ],
    createdAt: "2026-10-18 10:50",
  },
  {
    id: "INS-202610-002",
    date: "2026-10-14",
    installationTime: "13:00",
    startTime: "13:00",
    endTime: "15:40",
    durationFormatted: "2 Jam 40 Menit",
    durationMinutes: 160,
    deviceId: "D034",
    serialNumber: "SN034",
    unitNo: "DT-103",
    equipmentType: "Dump Truck",
    shift: "Shift 2",
    sourcePower: "Acc On",
    spmVersion: "v1.2.4 (Stable)",
    district: "Bengalon",
    area: "Pit B South Workshop",
    locationDetail: "Bay 2 Workshop Bengalon",
    ipAddress: "192.168.2.115",
    ipCpe: "192.168.2.1",
    ipVhms: "192.168.2.40",
    technicianName: "Dedi Supriyadi",
    technicianNrp: "NRP-772188",
    groupLeaderName: "Bambang Hermanto (GL)",
    status: "completed",
    remarks:
      "Pemasangan perangkat baru pada unit Dump Truck DT-103 Bengalon. Seluruh indikator daya LED hijau menyala stabil, koneksi CPE normal.",
    notes:
      "Pemasangan perangkat baru pada unit Dump Truck DT-103 Bengalon. Seluruh indikator daya LED hijau menyala stabil, koneksi CPE normal.",
    photos: [
      {
        slot: "mh02_installed",
        slotLabel: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel,
        url: DEMO_PHOTO_SLOTS.mh02_installed.svgDataUri,
        caption: "Armada Dump Truck DT-103 selesai proses pemasangan MH02.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Kamera dashboard terkalibrasi presisi.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Node-RED UI membaca status VHMS normal.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GPS eksternal tersegel rapat di atap unit DT-103.",
      },
    ],
    createdAt: "2026-10-14 15:55",
  },
  {
    id: "INS-202609-003",
    date: "2026-09-25",
    installationTime: "09:15",
    startTime: "09:15",
    endTime: "11:30",
    durationFormatted: "2 Jam 15 Menit",
    durationMinutes: 135,
    deviceId: "D044",
    serialNumber: "SN044",
    unitNo: "DT-201",
    equipmentType: "Dump Truck",
    shift: "Shift 1",
    sourcePower: "Standby PDU",
    spmVersion: "v2.0.1",
    district: "Wahau",
    area: "Field Bay Area Wahau",
    locationDetail: "Field Bay Workshop Wahau",
    ipAddress: "192.168.3.104",
    ipCpe: "192.168.3.1",
    ipVhms: "192.168.3.30",
    technicianName: "Hendro Wibowo",
    technicianNrp: "NRP-773012",
    groupLeaderName: "Rudi Hartono (GL)",
    status: "completed",
    remarks:
      "Pemasangan unit baru MH02 berjalan sesuai SOP tambang Wahau. Dilengkapi pelindung kabel harness tahan panas dan getaran.",
    notes:
      "Pemasangan unit baru MH02 berjalan sesuai SOP tambang Wahau. Dilengkapi pelindung kabel harness tahan panas dan getaran.",
    photos: [
      {
        slot: "mh02_installed",
        slotLabel: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel,
        url: DEMO_PHOTO_SLOTS.mh02_installed.svgDataUri,
        caption: "Unit DT-201 siap beroperasi kembali dengan perangkat MH02 terverifikasi.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Kamera dashboard terpasang kokoh anti-vibrasi.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Konfigurasi Node-RED menerima data CAN-bus stabil.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GPS terpasang pada dudukan magnetik atap kabin.",
      },
    ],
    createdAt: "2026-09-25 11:45",
  },
  {
    id: "INS-202609-004",
    date: "2026-09-18",
    installationTime: "14:00",
    startTime: "14:00",
    endTime: "16:15",
    durationFormatted: "2 Jam 15 Menit",
    durationMinutes: 135,
    deviceId: "D012",
    serialNumber: "SN012",
    unitNo: "WT-05",
    equipmentType: "Water Truck",
    shift: "Shift 2",
    sourcePower: "Acc On",
    spmVersion: "v1.2.4 (Stable)",
    district: "Sangatta",
    area: "Hauling Road KM 12",
    locationDetail: "Water Station Sangatta KM 12",
    ipAddress: "192.168.1.144",
    ipCpe: "192.168.1.1",
    ipVhms: "192.168.1.65",
    technicianName: "Ahmad Rizki",
    technicianNrp: "NRP-772104",
    groupLeaderName: "Agus Setiawan (GL)",
    status: "completed",
    remarks:
      "Pemasangan unit telematika pada armada Water Truck WT-05. Antena diposisikan di atap kabin dengan proteksi silikon tahan air hujan.",
    notes:
      "Pemasangan unit telematika pada armada Water Truck WT-05. Antena diposisikan di atap kabin dengan proteksi silikon tahan air hujan.",
    photos: [
      {
        slot: "mh02_installed",
        slotLabel: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel,
        url: DEMO_PHOTO_SLOTS.mh02_installed.svgDataUri,
        caption: "Tampak modul MH02 terpasang pada panel Water Truck WT-05.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Kamera dashboard terarah tepat ke jalur lintas dan kabin pengemudi.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Node-RED membaca sinyal GPS dan status catu daya 24V normal.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GNSS terlindung cover kedap air di atap armada.",
      },
    ],
    createdAt: "2026-09-18 16:30",
  },
  {
    id: "INS-202608-005",
    date: "2026-08-28",
    installationTime: "08:00",
    startTime: "08:00",
    endTime: "10:50",
    durationFormatted: "2 Jam 50 Menit",
    durationMinutes: 170,
    deviceId: "D004",
    serialNumber: "SN004",
    unitNo: "LD-02",
    equipmentType: "Loader",
    shift: "Shift 1",
    sourcePower: "Standby PDU",
    spmVersion: "v1.2.4 (Stable)",
    district: "Sangatta",
    area: "Pit 2 South Yard",
    locationDetail: "Heavy Equipment Yard Sangatta Pit 2",
    ipAddress: "192.168.1.180",
    ipCpe: "192.168.1.1",
    ipVhms: "192.168.1.80",
    technicianName: "Fauzan Aditya",
    technicianNrp: "NRP-774520",
    groupLeaderName: "Hendra Wijaya (GL)",
    status: "completed",
    remarks:
      "Pemasangan MH02 tracking pada unit Loader LD-02. Menggunakan peredam karet ekstra untuk meminimalkan getaran hidrolik loader.",
    notes:
      "Pemasangan MH02 tracking pada unit Loader LD-02. Menggunakan peredam karet ekstra untuk meminimalkan getaran hidrolik loader.",
    photos: [
      {
        slot: "mh02_installed",
        slotLabel: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel,
        url: DEMO_PHOTO_SLOTS.mh02_installed.svgDataUri,
        caption: "Unit Loader LD-02 dengan perangkat telematika MH02 terpasang.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Kamera diarahkan untuk visibilitas bucket dan area kabin operator.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Node-RED live dashboard menampilkan telemetri tekanan & getaran normal.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GPS terlindung braket baja pelindung benturan.",
      },
    ],
    createdAt: "2026-08-28 11:00",
  },
  {
    id: "INS-202608-006",
    date: "2026-08-10",
    installationTime: "10:30",
    startTime: "10:30",
    endTime: "13:00",
    durationFormatted: "2 Jam 30 Menit",
    durationMinutes: 150,
    deviceId: "D052",
    serialNumber: "SN052",
    unitNo: "DT-305",
    equipmentType: "Dump Truck",
    shift: "Shift 1",
    sourcePower: "Stand By",
    spmVersion: "v1.0.0",
    district: "Sangatta Utara",
    area: "North Workshop Bay 1",
    locationDetail: "North Workshop Bay 1 Sangatta Utara",
    ipAddress: "192.168.4.110",
    ipCpe: "192.168.4.1",
    ipVhms: "192.168.4.55",
    technicianName: "Fajar Pratama",
    technicianNrp: "NRP-773409",
    groupLeaderName: "Surya Pratama (GL)",
    status: "completed",
    remarks:
      "Registrasi dan instalasi armada Dump Truck DT-305 di site Sangatta Utara. Berhasil terkoneksi ke satelit GPS dan jaringan lokal workshop.",
    notes:
      "Registrasi dan instalasi armada Dump Truck DT-305 di site Sangatta Utara. Berhasil terkoneksi ke satelit GPS dan jaringan lokal workshop.",
    photos: [
      {
        slot: "mh02_installed",
        slotLabel: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel,
        url: DEMO_PHOTO_SLOTS.mh02_installed.svgDataUri,
        caption: "Dump Truck DT-305 Sangatta Utara selesai perakitan MH02.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Posisi kamera pada dashboard terarah tepat ke blindspot & pandangan depan.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Node-RED konfigurasi v1.0.0 menunjukkan koneksi VHMS aktif.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GPS terkunci 11 satelit dengan akurasi koordinat tinggi.",
      },
    ],
    createdAt: "2026-08-10 13:15",
  },
];

// High-water mark state per month for Form ID generation
const INSTALLATION_FORM_NUMBER_PATTERN = /^INS-(\d{6})-(\d+)$/i;
const installationSequenceByMonth = new Map<string, number>();

export function rememberInstallationFormNumber(id: string): void {
  const match = INSTALLATION_FORM_NUMBER_PATTERN.exec(id);
  if (!match) return;
  const [, month, sequenceText] = match;
  const sequence = Number(sequenceText);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return;
  installationSequenceByMonth.set(
    month,
    Math.max(installationSequenceByMonth.get(month) ?? 0, sequence)
  );
}

// Seed the in-memory high-water marks from all IDs at module startup
initialInstallations.forEach((record) => rememberInstallationFormNumber(record.id));

export function getNextInstallationFormNumber(date: string): string {
  const yearMonth = date.slice(0, 7).replace("-", "");
  const activeMaximum = initialInstallations.reduce((maximum, record) => {
    const match = INSTALLATION_FORM_NUMBER_PATTERN.exec(record.id);
    if (!match || match[1] !== yearMonth) return maximum;
    const sequence = Number(match[2]);
    return Number.isSafeInteger(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);
  const sequence = Math.max(installationSequenceByMonth.get(yearMonth) ?? 0, activeMaximum) + 1;
  installationSequenceByMonth.set(yearMonth, sequence);
  return `INS-${yearMonth}-${String(sequence).padStart(3, "0")}`;
}

const installationListeners = new Set<() => void>();

export function getInstallationRecords(): InstallationRecord[] {
  return initialInstallations;
}

export function subscribeToInstallationRecords(listener: () => void): () => void {
  installationListeners.add(listener);
  return () => installationListeners.delete(listener);
}

function notifyInstallationListeners(): void {
  installationListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Subscriber failure must not roll back a committed in-memory transaction
    }
  });
}

function publishInstallationRecords(records: InstallationRecord[]): void {
  initialInstallations = records;
  notifyInstallationListeners();
}

export function getInstallationById(id: string): InstallationRecord | undefined {
  return initialInstallations.find((i) => i.id.toLowerCase() === id.toLowerCase());
}

/**
 * Menambahkan catatan instalasi baru ke in-memory dataset riwayat pemasangan
 */
export function addInstallationRecord(record: InstallationRecord): InstallationRecord[] {
  if (!initialInstallations.some((i) => i.id === record.id)) {
    rememberInstallationFormNumber(record.id);
    publishInstallationRecords([record, ...initialInstallations]);
  }
  return initialInstallations;
}

export type InstallationCreationResult =
  | { success: true }
  | { success: false; message: string };

/**
 * Creates an Installation record and updates its device as one synchronous
 * in-memory operation. Validation happens before either store is changed.
 */
export function createInstallationWithDevice(
  record: InstallationRecord
): InstallationCreationResult {
  if (initialInstallations.some((existing) => existing.id.toLowerCase() === record.id.toLowerCase())) {
    return { success: false, message: `Nomor formulir ${record.id} sudah digunakan.` };
  }

  const device = devices.find((entry) => entry.deviceId.toLowerCase() === record.deviceId.toLowerCase());
  if (!device) {
    return { success: false, message: `Perangkat ${record.deviceId} tidak ditemukan pada master perangkat.` };
  }
  if (device.status !== "in_stock_rfu") {
    return {
      success: false,
      message: `Perangkat ${record.deviceId} tidak lagi tersedia untuk Installation (status saat ini: ${device.status}).`,
    };
  }

  const previousDevice = { ...device };
  const previousRecords = initialInstallations;
  const recordWithSnapshot: InstallationRecord = {
    ...record,
    masterStateBefore: { device: { ...device } },
  };

  try {
    rememberInstallationFormNumber(record.id);
    device.status = "in_use";
    device.unitNo = record.unitNo;
    device.equipmentType = record.equipmentType;
    device.district = record.district;
    device.lastMaintenanceDate = record.date;

    publishInstallationRecords([recordWithSnapshot, ...initialInstallations]);
    return { success: true };
  } catch {
    initialInstallations = previousRecords;
    Object.assign(device, previousDevice);
    return {
      success: false,
      message: "Installation gagal disimpan. Data perangkat dan laporan dikembalikan ke kondisi sebelumnya.",
    };
  }
}

export type InstallationDeletionResult =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * Restores pre-installation master device state and deletes installation record atomically.
 * Superadmin only.
 */
export function executeDeviceInstallationDelete(
  recordId: string,
  actorRole: string
): InstallationDeletionResult {
  if (actorRole !== "superadmin") {
    return { success: false, message: "Hanya Superadmin yang dapat menghapus laporan Installation." };
  }

  const record = getInstallationById(recordId);
  if (!record) {
    return { success: false, message: "Laporan Installation tidak ditemukan. Tidak ada data yang diubah." };
  }

  const device = devices.find(
    (d) => d.deviceId.toLowerCase() === record.deviceId.toLowerCase()
  );
  if (!device) {
    return { success: false, message: `Perangkat ${record.deviceId} tidak ditemukan pada master. Tidak ada data yang diubah.` };
  }

  // Safety check: check if there are later transactions for this device
  const followsTarget = (other: InstallationRecord) =>
    other.date > record.date ||
    (other.date === record.date && (other.startTime || "") >= (record.startTime || ""));
  const laterRelated = initialInstallations.find(
    (other) =>
      other.id !== record.id &&
      followsTarget(other) &&
      other.deviceId.toLowerCase() === record.deviceId.toLowerCase()
  );
  if (laterRelated) {
    return {
      success: false,
      message: `Laporan Installation tidak dapat dihapus karena perangkat terkait telah digunakan pada laporan lanjutan ${laterRelated.id}. Tidak ada data yang diubah.`,
    };
  }

  // Revert device if it is currently in_use and assigned to this installation's unit
  const shouldRevertDevice = device.status === "in_use" && device.unitNo === record.unitNo;

  const recordIndex = initialInstallations.indexOf(record);
  if (recordIndex < 0) {
    return { success: false, message: "Laporan Installation sudah tidak tersedia di daftar." };
  }

  const previousRecords = initialInstallations;
  const previousDevice = { ...device };

  try {
    if (shouldRevertDevice) {
      if (record.masterStateBefore?.device) {
        Object.assign(device, record.masterStateBefore.device);
      } else {
        device.status = "in_stock_rfu";
        device.unitNo = null;
      }
    }

    const nextRecords = [...initialInstallations];
    nextRecords.splice(recordIndex, 1);
    publishInstallationRecords(nextRecords);

    return {
      success: true,
      message: `Laporan ${record.id} berhasil dihapus${shouldRevertDevice ? ` dan status perangkat ${record.deviceId} dikembalikan ke In Stock (RFU)` : ""}.`,
    };
  } catch {
    initialInstallations = previousRecords;
    Object.assign(device, previousDevice);
    return {
      success: false,
      message: "Penghapusan gagal. Laporan dan master perangkat dikembalikan ke kondisi sebelumnya.",
    };
  }
}

export type InstallationEditResult =
  | { success: true; record: InstallationRecord; message?: string }
  | { success: false; message: string };

const installationMasterFields: (keyof InstallationRecord)[] = [
  "deviceId",
  "unitNo",
  "equipmentType",
  "district",
  "date",
];

export function prepareDeviceInstallationEdit(
  recordId: string,
  proposed: InstallationRecord,
  actorRole: string
): InstallationEditResult {
  if (actorRole !== "superadmin") {
    return { success: false, message: "Hanya Superadmin yang dapat mengubah laporan Installation." };
  }
  const original = getInstallationById(recordId);
  if (!original) {
    return { success: false, message: "Laporan Installation tidak lagi tersedia." };
  }
  if (proposed.id !== original.id) {
    return { success: false, message: "Nomor formulir tidak dapat diubah." };
  }

  const masterChanged = installationMasterFields.some((f) => proposed[f] !== original[f]);
  if (!masterChanged) {
    return {
      success: true,
      record: {
        ...original,
        ...proposed,
        id: original.id,
        masterStateBefore: original.masterStateBefore,
      },
    };
  }

  // If device ID changed:
  if (proposed.deviceId.toLowerCase() !== original.deviceId.toLowerCase()) {
    const oldDev = devices.find((d) => d.deviceId.toLowerCase() === original.deviceId.toLowerCase());
    const newDev = devices.find((d) => d.deviceId.toLowerCase() === proposed.deviceId.toLowerCase());
    if (!oldDev) return { success: false, message: `Perangkat asal ${original.deviceId} tidak ditemukan di master.` };
    if (!newDev) return { success: false, message: `Perangkat baru ${proposed.deviceId} tidak ditemukan di master.` };
    if (newDev.status !== "in_stock_rfu") {
      return { success: false, message: `Perangkat baru ${newDev.deviceId} tidak berstatus In Stock RFU (status saat ini: ${newDev.status}).` };
    }
  }

  return {
    success: true,
    record: {
      ...original,
      ...proposed,
      id: original.id,
      masterStateBefore: original.masterStateBefore,
    },
  };
}

export function executeDeviceInstallationEdit(
  recordId: string,
  proposed: InstallationRecord,
  actorRole: string
): InstallationEditResult {
  const prepared = prepareDeviceInstallationEdit(recordId, proposed, actorRole);
  if (!prepared.success) return prepared;

  const original = getInstallationById(recordId);
  if (!original) return { success: false, message: "Laporan Installation tidak lagi tersedia." };
  const index = initialInstallations.indexOf(original);
  if (index < 0) return { success: false, message: "Laporan Installation tidak lagi tersedia di daftar." };

  const candidate = prepared.record;
  const masterChanged = installationMasterFields.some((f) => candidate[f] !== original[f]);
  const previousRecords = initialInstallations;

  const oldDev = devices.find((d) => d.deviceId.toLowerCase() === original.deviceId.toLowerCase());
  const newDev = devices.find((d) => d.deviceId.toLowerCase() === candidate.deviceId.toLowerCase());
  const affected = Array.from(new Set([oldDev, newDev].filter((d): d is DeviceRecord => Boolean(d))));
  const deviceBackups = affected.map((d) => ({ device: d, state: { ...d } }));

  try {
    if (masterChanged && oldDev) {
      if (candidate.deviceId.toLowerCase() !== original.deviceId.toLowerCase() && newDev) {
        // Revert old device
        oldDev.status = "in_stock_rfu";
        oldDev.unitNo = null;

        // Apply new device
        newDev.status = "in_use";
        newDev.unitNo = candidate.unitNo;
        newDev.equipmentType = candidate.equipmentType;
        newDev.district = candidate.district;
        newDev.lastMaintenanceDate = candidate.date;
      } else {
        // Same device, update unitNo/equipmentType/district/date if still in_use
        if (oldDev.status === "in_use") {
          oldDev.unitNo = candidate.unitNo;
          oldDev.equipmentType = candidate.equipmentType;
          oldDev.district = candidate.district;
          oldDev.lastMaintenanceDate = candidate.date;
        }
      }
    }

    const nextRecords = [...initialInstallations];
    nextRecords[index] = candidate;
    publishInstallationRecords(nextRecords);

    return {
      success: true,
      record: candidate,
      message: `Perubahan formulir ${candidate.id} berhasil disimpan.`,
    };
  } catch {
    initialInstallations = previousRecords;
    deviceBackups.forEach(({ device, state }) => Object.assign(device, state));
    return {
      success: false,
      message: "Gagal menyimpan perubahan. Data dikembalikan ke kondisi sebelumnya.",
    };
  }
}
