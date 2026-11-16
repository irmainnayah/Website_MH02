import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900 font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
