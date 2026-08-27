import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A template row from phase_templates
interface TemplateRow extends RowDataPacket {
  id: string;
  name: string;
  created_at: Date;
}

// The pieces we read back from phase_template_steps
interface StepRow extends RowDataPacket {
  template_id: string;
  name: string;
}

/**
 * Lists every phase template newest-first, each with its steps
 * (in step_order) nested as an array of step-name strings.
 */
export async function GET() {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [templates] = await db.query<TemplateRow[]>(
      "SELECT id, name, created_at FROM phase_templates ORDER BY created_at DESC"
    );
    const [stepRows] = await db.query<StepRow[]>(
      "SELECT template_id, name FROM phase_template_steps ORDER BY template_id, step_order"
    );

    // Group the flat step rows by their template.
    const stepsByTemplate = new Map<string, string[]>();
    for (const row of stepRows) {
      const list = stepsByTemplate.get(row.template_id) ?? [];
      list.push(row.name);
      stepsByTemplate.set(row.template_id, list);
    }

    return NextResponse.json(
      templates.map((template) => ({
        id: template.id,
        name: template.name,
        createdAt: template.created_at,
        steps: stepsByTemplate.get(template.id) ?? [],
      }))
    );
  } catch (error) {
    console.error("Failed to list phase templates:", error);
    return NextResponse.json(
      { message: "Could not load phase templates. Please try again." },
      { status: 500 }
    );
  }
}

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
 * Creates a phase template along with its ordered steps.
 * Body: { name: string, steps: string[] } — steps are stored 1..n.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const id = randomUUID();
    await connection.query<ResultSetHeader>(
      "INSERT INTO phase_templates (id, name) VALUES (?, ?)",
      [id, name]
    );

    // One bulk insert keeps it atomic — values arrive as (uuid, id, name, order).
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

    return NextResponse.json({ id, name, steps }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to create phase template:", error);
    return NextResponse.json(
      { message: "Could not save the phase template. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
