import { NextResponse } from "next/server";

// TODO(feature): Clients API — implement CRUD as part of the POS feature.
export async function GET() {
  return NextResponse.json(
    { message: "Not implemented yet" },
    { status: 501 }
  );
}
