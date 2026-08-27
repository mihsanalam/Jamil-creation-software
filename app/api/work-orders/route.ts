import { NextResponse } from "next/server";

// TODO(feature): Work Orders API — implement as part of the Work Order feature.
export async function GET() {
  return NextResponse.json(
    { message: "Not implemented yet" },
    { status: 501 }
  );
}
