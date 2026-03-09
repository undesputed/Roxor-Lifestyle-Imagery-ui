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
    generatedAt: new Date().toISOString().split("T")[0],
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
