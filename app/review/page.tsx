"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  loadImages,
  updateImageStatus,
  type GeneratedImage,
  type ReviewStatus,
} from "@/lib/store";

const STATUS_BADGE: Record<ReviewStatus, { label: string; className: string }> = {
  pending: { label: "Pending Review", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 border-green-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200" },
};

export default function ReviewPage() {
  const [images, setImages] = useState<GeneratedImage[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setImages(loadImages());
  }, []);

  function handleStatus(id: string, status: ReviewStatus) {
    updateImageStatus(id, status);
    setImages(loadImages());
  }

  const pending = images.filter((i) => i.status === "pending");
  const reviewed = images.filter((i) => i.status !== "pending");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Review</h2>
        <p className="text-muted-foreground mt-1">
          Approve or reject generated images before uploading to Scaleflex.
        </p>
      </div>

      {images.length === 0 && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground">No images in the review queue yet.</p>
            <a href="/generate" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Go to Generate
            </a>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Pending ({pending.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pending.map((img) => (
              <Card key={img.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-semibold">{img.salesCode}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{img.slot.toUpperCase()}</span>
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE[img.status].className}>
                      {STATUS_BADGE[img.status].label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={`${img.salesCode} ${img.slot}`}
                    className="w-full rounded-md border aspect-square object-cover"
                  />
                  <p className="text-xs text-muted-foreground">Generated {img.generatedAt}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleStatus(img.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-destructive border-destructive/50 hover:bg-destructive/10"
                      onClick={() => handleStatus(img.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Reviewed ({reviewed.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviewed.map((img) => (
              <Card key={img.id} className="opacity-70">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">
                      {img.salesCode} — {img.slot.toUpperCase()}
                    </span>
                    <Badge variant="outline" className={STATUS_BADGE[img.status].className}>
                      {STATUS_BADGE[img.status].label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={`${img.salesCode} ${img.slot}`}
                    className="w-full rounded-md border aspect-square object-cover"
                  />
                  {img.status === "approved" && (
                    <a
                      href={`/upload?salesCode=${img.salesCode}&slot=${img.slot}&url=${encodeURIComponent(img.url)}`}
                      className={cn(buttonVariants({ size: "sm" }), "w-full justify-center")}
                    >
                      Upload to Scaleflex
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
