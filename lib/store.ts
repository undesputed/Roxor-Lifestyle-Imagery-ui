/**
 * Lightweight localStorage store for generated images.
 * Shared between the Generate and Review pages.
 */

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

const KEY = "roxor_generated_images";

export function loadImages(): GeneratedImage[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveImages(images: GeneratedImage[]): void {
  localStorage.setItem(KEY, JSON.stringify(images));
}

export function addImage(image: Omit<GeneratedImage, "id" | "status" | "generatedAt">): GeneratedImage {
  const newImage: GeneratedImage = {
    ...image,
    id: crypto.randomUUID(),
    status: "pending",
    generatedAt: (() => {
      const d = new Date();
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
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
    (img) => img.salesCode === salesCode && img.slot === "ls1" && img.status === "approved"
  );
  return match?.url ?? null;
}
