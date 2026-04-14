"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StylePreset = {
  name: string;
  displayName: string;
  description: string;
};

type StyleResponse = {
  activeName: string;
  presets: StylePreset[];
};

export default function SettingsPage() {
  const [activeName, setActiveName]   = useState<string | null>(null);
  const [presets, setPresets]         = useState<StylePreset[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activating, setActivating]   = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/generate/style")
      .then((r) => r.json())
      .then((data: StyleResponse) => {
        setActiveName(data.activeName ?? null);
        setPresets(data.presets ?? []);
      })
      .catch(() => setError("Failed to load style presets."))
      .finally(() => setLoading(false));
  }, []);

  async function handleActivate(name: string) {
    if (name === activeName || activating) return;
    setActivating(name);
    setError(null);
    try {
      const res = await fetch("/api/generate/style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleName: name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      setActiveName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update style.");
    } finally {
      setActivating(null);
    }
  }

  const activePreset = presets.find((p) => p.name === activeName);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Style Presets</h2>
        <p className="text-sm text-muted-foreground">
          Choose the room style applied to all new generation jobs.
        </p>
      </div>

      {/* Active style indicator */}
      {activePreset && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active:</span>
          <Badge variant="secondary" className="font-medium">
            {activePreset.displayName}
          </Badge>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Preset cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-32 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-4/5 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {presets.map((preset) => {
            const isActive   = preset.name === activeName;
            const isBusy     = activating === preset.name;

            return (
              <Card
                key={preset.name}
                className={cn(
                  "relative transition-all",
                  isActive
                    ? "border-primary ring-1 ring-primary"
                    : "hover:border-muted-foreground/40"
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-snug">
                      {preset.displayName}
                    </CardTitle>
                    {isActive && (
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {preset.description}
                  </p>

                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!!activating}
                      onClick={() => handleActivate(preset.name)}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Activating…
                        </>
                      ) : (
                        "Activate"
                      )}
                    </Button>
                  )}

                  {isActive && (
                    <div className="text-xs text-primary font-medium text-center py-1">
                      Currently active
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
