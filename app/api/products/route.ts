import { NextResponse } from "next/server";

// TODO(feature): Products API — implement as part of the Products feature.
export async function GET() {
  return NextResponse.json(
    { message: "Not implemented yet" },
    { status: 501 }
  );
}
