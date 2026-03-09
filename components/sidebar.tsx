"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ImageIcon,
  LayoutDashboard,
  ListChecks,
  Moon,
  Search,
  Sun,
  Upload,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Search },
  { href: "/generate", label: "Generate", icon: ImageIcon },
  { href: "/review", label: "Review", icon: ListChecks },
  { href: "/upload", label: "Upload", icon: Upload },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-card flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center shrink-0">
            <ImageIcon className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-xs font-semibold leading-none">Roxor Group</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">Lifestyle Imagery</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "opacity-100" : "opacity-70")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">kie.ai · Nano Banana Pro</p>
        <ThemeToggle />
      </div>
    </aside>
  );
}
