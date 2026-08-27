import { NextResponse } from "next/server";

// TODO(feature): Sales API — implement as part of the Sales & Dues / POS feature.
export async function GET() {
  return NextResponse.json(
    { message: "Not implemented yet" },
    { status: 501 }
  );
}
