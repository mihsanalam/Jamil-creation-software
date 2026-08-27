import { NextResponse } from "next/server";

// TODO(feature): Phases API — implement as part of the Phase Board feature.
export async function GET() {
  return NextResponse.json(
    { message: "Not implemented yet" },
    { status: 501 }
  );
}
