import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppState, Order } from "../domain/types";
import { money, paymentLabels, shortDate } from "../shared/format";

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

type ReceiptAlign = "right" | "center" | "left";

interface ReceiptColumn {
  text: string;
  width: number;
  align: ReceiptAlign;
  size: number;
  bold: boolean;
  rtl: boolean;
}

type ReceiptBlock =
  | { kind: "text"; text: string; align: ReceiptAlign; size: number; bold: boolean; rtl: boolean }
  | { kind: "columns"; columns: ReceiptColumn[] }
  | { kind: "separator" }
  | { kind: "space"; height: number };

interface ReceiptDocument {
  printerName: string;
  documentName: string;
  paperWidthMm: number;
  blocks: ReceiptBlock[];
}

const text = (
  value: string,
  options: Partial<Omit<Extract<ReceiptBlock, { kind: "text" }>, "kind" | "text">> = {}
): ReceiptBlock => ({
  kind: "text",
  text: value,
  align: options.align ?? "right",
  size: options.size ?? 10,
  bold: options.bold ?? false,
  rtl: options.rtl ?? true
});

const column = (
  value: string,
  width: number,
  options: Partial<Omit<ReceiptColumn, "text" | "width">> = {}
): ReceiptColumn => ({
  text: value,
  width,
  align: options.align ?? "right",
  size: options.size ?? 9,
  bold: options.bold ?? false,
  rtl: options.rtl ?? true
});

const columns = (...items: ReceiptColumn[]): ReceiptBlock => ({ kind: "columns", columns: items });
const separator = (): ReceiptBlock => ({ kind: "separator" });
const space = (height = 5): ReceiptBlock => ({ kind: "space", height });

export const isDesktopRuntime = () => isTauri();

export async function listDesktopPrinters(): Promise<PrinterInfo[]> {
  if (!isDesktopRuntime()) return [];
  return invoke<PrinterInfo[]>("list_printers");
}

export async function printOrderReceipts(order: Order, settings: AppState["settings"]) {
  if (!isDesktopRuntime()) throw new Error("الطباعة المباشرة متاحة في نسخة الديسكتوب فقط");
  const documents: ReceiptDocument[] = [];
  if (settings.printCustomerReceipt !== false) documents.push(customerReceipt(order, settings));
  if (settings.printKitchenReceipt !== false) documents.push(kitchenReceipt(order, settings));
  await printDocumentsInOrder(documents);
}

export async function printTestReceipt(
  kind: "customer" | "kitchen",
  printerName: string,
  settings: AppState["settings"]
) {
  const label = kind === "customer" ? "فاتورة العميل" : "ريسيت المطبخ";
  await printDocument({
    printerName,
    documentName: `Beitna printer test - ${label}`,
    paperWidthMm: 80,
    blocks: [
      text(settings.restaurantName, { align: "center", size: 15, bold: true }),
      text("اختبار الطابعة", { align: "center", size: 13, bold: true }),
      separator(),
      text(label, { align: "center", size: 12, bold: true }),
      text(shortDate(new Date().toISOString()), { align: "center", size: 9 }),
      space(),
      text("تم الاتصال بالطابعة بنجاح", { align: "center", size: 10, bold: true }),
      separator()
    ]
  });
}

async function printDocumentsInOrder(documents: ReceiptDocument[]) {
  const failures: string[] = [];
  for (const document of documents) {
    try {
      await printDocument(document);
    } catch (error) {
      failures.push(`${document.documentName}: ${errorMessage(error)}`);
    }
  }
  if (failures.length) throw new Error(failures.join(" — "));
}

async function printDocument(payload: ReceiptDocument) {
  await invoke("print_receipt", { payload });
}

function customerReceipt(order: Order, settings: AppState["settings"]): ReceiptDocument {
  const blocks: ReceiptBlock[] = [
    ...brandBlocks(settings),
    separator(),
    columns(
      column(`#${order.number}`, 0.48, { align: "left", size: 11, bold: true, rtl: false }),
      column("رقم الطلب", 0.52, { size: 10, bold: true })
    ),
    columns(
      column(shortDate(order.createdAt), 0.58, { align: "left", size: 8 }),
      column("التاريخ", 0.42, { size: 9 })
    ),
    columns(
      column(`${paymentLabels[order.paymentMethod]} — ${order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}`, 0.65, { align: "left", size: 8 }),
      column("الدفع", 0.35, { size: 9 })
    ),
    separator(),
    text(order.customerName, { size: 11, bold: true }),
    ...(order.customerPhone ? [text(order.customerPhone, { size: 9, rtl: false })] : []),
    ...(order.address ? [text(order.address, { size: 8 })] : []),
    separator(),
    columns(
      column("السعر", 0.24, { align: "center", size: 8, bold: true }),
      column("الصنف", 0.56, { align: "center", size: 8, bold: true }),
      column("الكمية", 0.2, { align: "center", size: 8, bold: true })
    )
  ];

  order.items.forEach((item) => {
    blocks.push(columns(
      column(money(item.price * item.quantity), 0.24, { align: "center", size: 9, bold: true, rtl: false }),
      column(item.name, 0.56, { size: 9, bold: true }),
      column(String(item.quantity), 0.2, { align: "center", size: 10, bold: true, rtl: false })
    ));
    if (item.note) blocks.push(text(`ملاحظة الصنف: ${item.note}`, { size: 8 }));
  });

  blocks.push(
    separator(),
    summaryRow("الأصناف", money(order.subtotal)),
    summaryRow("التوصيل", money(order.deliveryFee)),
    ...(order.discount > 0 ? [summaryRow("الخصم", `- ${money(order.discount)}`)] : []),
    columns(
      column(money(order.total), 0.48, { align: "left", size: 14, bold: true, rtl: false }),
      column("الإجمالي", 0.52, { size: 13, bold: true })
    ),
    ...(order.note ? [separator(), text(`ملاحظة الطلب: ${order.note}`, { size: 9, bold: true })] : []),
    separator(),
    text(settings.invoiceFooter, { align: "center", size: 9, bold: true }),
    space(8)
  );

  return {
    printerName: settings.customerReceiptPrinter ?? "",
    documentName: `فاتورة العميل #${order.number}`,
    paperWidthMm: 80,
    blocks
  };
}

function kitchenReceipt(order: Order, settings: AppState["settings"]): ReceiptDocument {
  const blocks: ReceiptBlock[] = [
    text(settings.restaurantName, { align: "center", size: 15, bold: true }),
    text("ريسيت المطبخ", { align: "center", size: 14, bold: true }),
    separator(),
    text(`#${order.number}`, { align: "center", size: 20, bold: true, rtl: false }),
    columns(
      column(shortDate(order.createdAt), 0.62, { align: "left", size: 8 }),
      column("وقت الطلب", 0.38, { size: 9, bold: true })
    ),
    columns(
      column(order.scheduledFor ? "طلب مجدول" : "مطلوب الآن", 0.62, { align: "left", size: 9, bold: true }),
      column("نوع الطلب", 0.38, { size: 9 })
    ),
    ...(order.scheduledFor ? [columns(
      column(shortDate(order.scheduledFor), 0.62, { align: "left", size: 9, bold: true }),
      column("موعد التجهيز", 0.38, { size: 9 })
    )] : []),
    columns(
      column(order.customerName, 0.62, { align: "left", size: 9, bold: true }),
      column("العميل", 0.38, { size: 9 })
    ),
    separator(),
    columns(
      column("الصنف والتفاصيل", 0.76, { align: "center", size: 9, bold: true }),
      column("الكمية", 0.24, { align: "center", size: 9, bold: true })
    )
  ];

  order.items.forEach((item) => {
    blocks.push(columns(
      column(item.name, 0.76, { size: 12, bold: true }),
      column(`${item.quantity}×`, 0.24, { align: "center", size: 14, bold: true, rtl: false })
    ));
    const details = item.mealComponents?.length
      ? item.mealComponents.map((component) => `${component.quantity}× ${component.name}`).join(" · ")
      : item.note;
    if (details) blocks.push(text(details, { size: 9, bold: true }));
    blocks.push(space(3));
  });

  blocks.push(
    separator(),
    columns(
      column(String(order.items.reduce((sum, item) => sum + item.quantity, 0)), 0.42, { align: "left", size: 15, bold: true, rtl: false }),
      column("إجمالي الوحدات", 0.58, { size: 11, bold: true })
    ),
    ...(order.note ? [separator(), text("ملاحظة الطلب", { size: 10, bold: true }), text(order.note, { size: 11, bold: true })] : []),
    separator(),
    text("للتجهيز فقط — بدون أسعار", { align: "center", size: 9, bold: true }),
    space(8)
  );

  return {
    printerName: settings.kitchenReceiptPrinter ?? "",
    documentName: `ريسيت المطبخ #${order.number}`,
    paperWidthMm: 80,
    blocks
  };
}

function brandBlocks(settings: AppState["settings"]): ReceiptBlock[] {
  return [
    text(settings.restaurantName, { align: "center", size: 15, bold: true }),
    ...(settings.subtitle ? [text(settings.subtitle, { align: "center", size: 9 })] : []),
    ...(settings.phone ? [text(settings.phone, { align: "center", size: 8, rtl: false })] : []),
    ...(settings.address ? [text(settings.address, { align: "center", size: 8 })] : [])
  ];
}

function summaryRow(label: string, value: string): ReceiptBlock {
  return columns(
    column(value, 0.48, { align: "left", size: 10, bold: true, rtl: false }),
    column(label, 0.52, { size: 10 })
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
