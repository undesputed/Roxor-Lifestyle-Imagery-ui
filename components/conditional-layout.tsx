"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

/**
 * Renders the full sidebar + main layout for all pages except /login,
 * which renders as a standalone full-screen page.
 */
export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
