import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// Defaults until the Owner customises them (stored in app_settings via the
// same mechanism as the bottleneck threshold on the dashboard).
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const DEFAULT_AGING_STOCK_DAYS = 30;

interface ProductRow extends RowDataPacket {
  id: string;
  barcode: string;
  work_order_id: string;
  product_type: string;
  fabric_type: string;
  quantity: string;
  quantity_remaining: string;
  storage_location: string;
  status: "IN_STOCK" | "SOLD";
  date_added: Date;
}

/** One finished-products lot flagged by either alert rule. */
interface StockAlertProduct {
  id: string;
  barcode: string;
  productType: string;
  fabricType: string;
  storageLocation: string;
  quantity: number;
  quantityRemaining: number;
  daysInStock: number;
  /** What triggered the alert — a lot can trip both. */
  lowStock: boolean;
  agingStock: boolean;
}

interface StockAlertsSummary {
  lowStockThreshold: number;
  agingStockDays: number;
  lowStockCount: number;
  agingStockCount: number;
  totalRemainingUnits: number;
}

async function readIntSetting(
  key: string,
  fallback: number
): Promise<number> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1`,
      [key]
    );
    const value = Number(rows[0]?.setting_value ?? "");
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * GET /api/stock-alerts — low-stock and aging-stock warnings (Owner only).
 *
 *   - Low stock: IN_STOCK lots whose quantity_remaining is at or below the
 *     Owner-configurable threshold (app_settings 'low_stock_threshold').
 *   - Aging stock: IN_STOCK lots sitting unsold for more than
 *     'aging_stock_days' days with units still on the shelf.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "OWNER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [lowThreshold, agingDays] = await Promise.all([
      readIntSetting("low_stock_threshold", DEFAULT_LOW_STOCK_THRESHOLD),
      readIntSetting("aging_stock_days", DEFAULT_AGING_STOCK_DAYS),
    ]);

    const [rows] = await db.query<ProductRow[]>(
      `SELECT fp.id, fp.barcode, fp.work_order_id, fp.quantity, fp.quantity_remaining,
              fp.storage_location, fp.status, fp.date_added,
              wo.product_type, fb.fabric_type
       FROM finished_products fp
       JOIN work_orders wo ON wo.id = fp.work_order_id
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       WHERE fp.status = 'IN_STOCK' AND fp.quantity_remaining > 0`
    );

    const now = Date.now();
    const products: StockAlertProduct[] = rows.map((row) => {
      const remaining = Number(row.quantity_remaining);
      const daysInStock = Math.floor((now - new Date(row.date_added).getTime()) / 86400000);
      return {
        id: row.id,
        barcode: row.barcode,
        productType: row.product_type,
        fabricType: row.fabric_type,
        storageLocation: row.storage_location,
        quantity: Number(row.quantity),
        quantityRemaining: remaining,
        daysInStock,
        lowStock: remaining <= lowThreshold,
        agingStock: daysInStock > agingDays,
      };
    });

    const alerts = products
      .filter((p) => p.lowStock || p.agingStock)
      // Worst first: lowest stock, then longest on the shelf.
      .sort(
        (a, b) =>
          a.quantityRemaining - b.quantityRemaining || b.daysInStock - a.daysInStock
      );

    const summary: StockAlertsSummary = {
      lowStockThreshold: lowThreshold,
      agingStockDays: agingDays,
      lowStockCount: alerts.filter((p) => p.lowStock).length,
      agingStockCount: alerts.filter((p) => p.agingStock).length,
      totalRemainingUnits: products.reduce((sum, p) => sum + p.quantityRemaining, 0),
    };

    return NextResponse.json({ summary, alerts });
  } catch (error) {
    console.error("Failed to load stock alerts:", error);
    return NextResponse.json(
      { message: "Could not load stock alerts. Please try again." },
      { status: 500 }
    );
  }
}
