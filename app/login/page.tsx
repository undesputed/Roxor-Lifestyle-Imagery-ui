"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Log initial mount, URL, and callbackUrl param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const callbackUrl = url.searchParams.get("callbackUrl");
    console.log("[login] mounted", {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
      callbackUrl,
    });
  }, []);

  // Basic client-side logging to help debug production behaviour.
  useEffect(() => {
    // This will show up in the browser console (including on Vercel).
    console.log("[login] session status changed:", status);
  }, [status]);

  // If we hit /login while already authenticated, send the user to the
  // intended callbackUrl (if present and same-origin) or fall back to "/".
  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;

    const current = new URL(window.location.href);
    const rawCallback = current.searchParams.get("callbackUrl");

    let destination = "/";
    if (rawCallback) {
      try {
        const cb = new URL(rawCallback, window.location.origin);
        if (cb.origin === window.location.origin) {
          destination = cb.pathname + cb.search + cb.hash;
        } else {
          console.warn("[login] Ignoring cross-origin callbackUrl:", rawCallback);
        }
      } catch (err) {
        console.warn("[login] Invalid callbackUrl, falling back to /:", rawCallback, err);
      }
    }

    console.log("[login] authenticated on /login, redirecting to:", destination, {
      rawCallback,
    });
    router.replace(destination);
  }, [status, router]);

  async function handleSignIn() {
    console.log("[login] sign-in button clicked", {
      status,
      location: window.location.href,
    });
    setLoading(true);
    try {
      const result = await signIn("cognito", { callbackUrl: "/" });
      // In normal redirect flows, execution usually won't reach here,
      // but if redirect: false is ever used this will log the outcome.
      console.log("[login] signIn resolved:", result);
    } catch (error) {
      console.error("[login] signIn error:", error);
    } finally {
      // If redirect happens this won't run, but if it doesn't we'll
      // avoid leaving the button stuck in a loading state.
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(to right, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border bg-card shadow-lg px-8 py-10 space-y-8">

          {/* Branding */}
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative h-10 w-48">
              <Image
                src="https://files.roxorgroup.com/branding%20folder/logos/Roxor_Logo__Wordmark__RGB__Black.png?vh=15b197"
                alt="Roxor"
                fill
                className="object-contain dark:invert"
                sizes="192px"
                priority
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Lifestyle Imagery Platform</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Sign in to continue</p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Sign-in section */}
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Sign in with your Roxor account to continue.
              </p>
            </div>

            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecting…
                </>
              ) : (
                "Sign in with Roxor Account"
              )}
            </button>
          </div>

        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Access is restricted to authorised Roxor Group personnel.
        </p>
      </div>
    </div>
  );
}
