import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") ?? "image.png";

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }

  const blob = await res.blob();
  const contentType = res.headers.get("content-type") ?? "image/png";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
