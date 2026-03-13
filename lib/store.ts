/**
 * Lightweight localStorage store for the Roxor Lifestyle Imagery pipeline.
 *
 * Two separate namespaces:
 *  1. GeneratedImage[]  — used by the Review page (unchanged API)
 *  2. JobSet[]          — used by the Generate queue + detail pages
 */

import type { JobSet, SlotJob, SlotStatus } from "./types";

// ─── Legacy: GeneratedImage (Review page — DO NOT CHANGE) ─────────────────────

export type Slot = "ls1" | "ls2" | "ls3";
export type ReviewStatus = "pending" | "approved" | "rejected";

export type GeneratedImage = {
  id: string;
  salesCode: string;
  slot: Slot;
  url: string;
  status: ReviewStatus;
  generatedAt: string;
};

const IMAGES_KEY = "roxor_generated_images";

export function loadImages(): GeneratedImage[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(IMAGES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveImages(images: GeneratedImage[]): void {
  localStorage.setItem(IMAGES_KEY, JSON.stringify(images));
}

export function addImage(
  image: Omit<GeneratedImage, "id" | "status" | "generatedAt">
): GeneratedImage {
  const newImage: GeneratedImage = {
    ...image,
    id: crypto.randomUUID(),
    status: "pending",
    generatedAt: (() => {
      const d = new Date();
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      ].join("-");
    })(),
  };
  const existing = loadImages();
  saveImages([newImage, ...existing]);
  return newImage;
}

export function updateImageStatus(id: string, status: ReviewStatus): void {
  const images = loadImages().map((img) =>
    img.id === id ? { ...img, status } : img
  );
  saveImages(images);
}

export function deleteImage(id: string): void {
  saveImages(loadImages().filter((img) => img.id !== id));
}

/** Find the most recent approved ls1 URL for a given salesCode. */
export function findApprovedLs1Url(salesCode: string): string | null {
  const match = loadImages().find(
    (img) =>
      img.salesCode === salesCode &&
      img.slot === "ls1" &&
      img.status === "approved"
  );
  return match?.url ?? null;
}

// ─── New: JobSet store (Generate queue) ───────────────────────────────────────

const JOBSETS_KEY = "roxor_job_sets";

export function loadJobSets(): JobSet[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(JOBSETS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveJobSets(sets: JobSet[]): void {
  localStorage.setItem(JOBSETS_KEY, JSON.stringify(sets));
}

export function addJobSet(set: JobSet): void {
  const existing = loadJobSets();
  // Prepend so the queue shows newest first
  saveJobSets([set, ...existing]);
}

export function getJobSet(jobSetId: string): JobSet | null {
  return loadJobSets().find((s) => s.jobSetId === jobSetId) ?? null;
}

/**
 * Partially update a JobSet's top-level fields.
 * Does NOT deep-merge jobs — use updateSlotJob / updateCompanionJob for that.
 */
export function updateJobSet(
  jobSetId: string,
  updates: Partial<Omit<JobSet, "jobSetId" | "jobs">>
): void {
  const sets = loadJobSets().map((s) =>
    s.jobSetId === jobSetId ? { ...s, ...updates } : s
  );
  saveJobSets(sets);
}

/** Update a specific slot (ls1 / ls2 / ls3) inside a job set. */
export function updateSlotJob(
  jobSetId: string,
  slot: "ls1" | "ls2" | "ls3",
  updates: Partial<SlotJob>
): void {
  const sets = loadJobSets().map((s) => {
    if (s.jobSetId !== jobSetId) return s;
    return {
      ...s,
      jobs: {
        ...s.jobs,
        [slot]: { ...s.jobs[slot], ...updates },
      },
    };
  });
  saveJobSets(sets);
}

/** Update a companion cutout job by its sales code. */
export function updateCompanionJob(
  jobSetId: string,
  companionSalesCode: string,
  updates: Partial<SlotJob>
): void {
  const sets = loadJobSets().map((s) => {
    if (s.jobSetId !== jobSetId) return s;
    return {
      ...s,
      jobs: {
        ...s.jobs,
        companions: s.jobs.companions.map((c) =>
          c.salesCode === companionSalesCode ? { ...c, ...updates } : c
        ),
      },
    };
  });
  saveJobSets(sets);
}

/** Delete a job set (e.g. after all slots are complete and sent to review). */
export function deleteJobSet(jobSetId: string): void {
  saveJobSets(loadJobSets().filter((s) => s.jobSetId !== jobSetId));
}

/**
 * Derive a simple overall status for display in the queue list.
 * - "complete"     all of ls1 + ls2 + ls3 are success
 * - "failed"       any of ls1 / ls2 / ls3 has failed
 * - "in_progress"  anything still polling or submitted
 * - "idle"         nothing submitted yet (shouldn't happen post-submit)
 */
export function deriveJobSetStatus(
  set: JobSet
): "complete" | "failed" | "in_progress" | "idle" {
  const mainSlots: SlotStatus[] = [
    set.jobs.ls1.status,
    set.jobs.ls2.status,
    set.jobs.ls3.status,
  ];
  if (mainSlots.every((s) => s === "success")) return "complete";
  if (mainSlots.some((s) => s === "failed")) return "failed";
  if (mainSlots.some((s) => s === "polling" || s === "submitted")) return "in_progress";
  return "idle";
}
