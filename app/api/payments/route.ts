import { NextResponse } from "next/server";

// TODO(feature): Payments API — implement as part of the Sales & Dues feature.
export async function GET() {
  return NextResponse.json(
    { message: "Not implemented yet" },
    { status: 501 }
  );
}
