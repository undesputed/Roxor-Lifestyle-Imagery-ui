"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { startTransition, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ImageIcon,
  LayoutDashboard,
  ListChecks,
  LogOut,
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

  useEffect(() => { startTransition(() => setMounted(true)); }, []);
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

function UserFooter() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";
  const name  = session?.user?.name  ?? email;
  const initials = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();

  return (
    <div className="px-4 py-4 border-t space-y-3">
      {/* User info */}
      {email && (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            {name && name !== email && (
              <p className="text-xs font-medium truncate leading-none">{name}</p>
            )}
            <p className="text-[11px] text-muted-foreground truncate leading-none mt-0.5">
              {email}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bottom row: model tag + theme toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">kie.ai · Nano Banana Pro</p>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-card flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b">
        <div className="space-y-2">
          <div className="relative h-6 w-[140px]">
            <Image
              src="https://files.roxorgroup.com/branding%20folder/logos/Roxor_Logo__Wordmark__RGB__Black.png?vh=15b197"
              alt="Roxor"
              fill
              className="object-contain dark:invert"
              sizes="140px"
              priority
            />
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

      {/* Footer with user + theme toggle */}
      <UserFooter />
    </aside>
  );
}
