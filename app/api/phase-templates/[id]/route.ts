import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

function validatePayload(body: Record<string, unknown>) {
  const name =
    typeof body.name === "string" && body.name.trim() !== ""
      ? body.name.trim()
      : null;

  const stepsAreValid =
    Array.isArray(body.steps) &&
    body.steps.length > 0 &&
    body.steps.every(
      (step: unknown) => typeof step === "string" && step.trim() !== ""
    );

  const steps = stepsAreValid
    ? (body.steps as string[]).map((step) => step.trim())
    : null;

  return { name, steps };
}

/**
 * Replaces a template wholesale: updates its name and swaps out every
 * step row for the submitted ones (order 1..n). Body + validation are
 * identical to POST /api/phase-templates.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { name, steps } = validatePayload(body);
  const missingFields: string[] = [];
  if (!name) missingFields.push("name");
  if (!steps) missingFields.push("steps");
  if (missingFields.length > 0) {
    return NextResponse.json(
      {
        message:
          "Missing or invalid required field(s): " +
          `${missingFields.join(", ")}` +
          (missingFields.includes("steps")
            ? " — steps must be a non-empty array of non-empty strings"
            : ""),
      },
      { status: 400 }
    );
  }

  // Guard against modifying a non-existent template.
  const [found] = await db.query<RowDataPacket[]>(
    "SELECT id FROM phase_templates WHERE id = ?",
    [id]
  );
  if (found.length === 0) {
    return NextResponse.json(
      { message: `No phase template found with id "${id}"` },
      { status: 404 }
    );
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query<ResultSetHeader>(
      "UPDATE phase_templates SET name = ? WHERE id = ?",
      [name, id]
    );

    // Full replace — delete then reinsert with fresh order values.
    await connection.query(
      "DELETE FROM phase_template_steps WHERE template_id = ?",
      [id]
    );

    const placeholders = steps!.map(() => "(?, ?, ?, ?)").join(", ");
    const values = steps!.flatMap((stepName, index) => [
      randomUUID(),
      id,
      stepName,
      index + 1,
    ]);
    await connection.query<ResultSetHeader>(
      `INSERT INTO phase_template_steps (id, template_id, name, step_order)
       VALUES ${placeholders}`,
      values
    );

    await connection.commit();

    return NextResponse.json({ id, name, steps });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update phase template:", error);
    return NextResponse.json(
      { message: "Could not save the phase template. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}

/**
 * Deletes a phase template. Its steps go away automatically via the
 * schema's ON DELETE CASCADE on phase_template_steps.template_id.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [result] = await db.query<ResultSetHeader>(
      "DELETE FROM phase_templates WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { message: `No phase template found with id "${id}"` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete phase template:", error);
    return NextResponse.json(
      { message: "Could not delete the phase template. Please try again." },
      { status: 500 }
    );
  }
}
