import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { extractEmails } from "@/lib/extractor";
import { parseExtractorQuery } from "@/lib/extractor/query-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as { query?: unknown };

    if (typeof body.query !== "string") {
      return NextResponse.json(
        { error: "A search query is required." },
        { status: 400 },
      );
    }

    const query = parseExtractorQuery(body.query);

    const result = await extractEmails(query);

    return NextResponse.json({
      query,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Extraction failed.";

    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
