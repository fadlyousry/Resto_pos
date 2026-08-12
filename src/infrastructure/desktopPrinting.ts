import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppState, Order } from "../domain/types";
import { money, shortDate } from "../shared/format";

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
  | { kind: "band"; leftText: string; rightText: string; size: number; filled: boolean }
  | { kind: "separator" }
  | { kind: "space"; height: number };

interface ReceiptDocument {
  printerName: string;
  documentName: string;
  paperWidthMm: number;
  blocks: ReceiptBlock[];
}

interface EscPosPrintJob {
  printerName: string;
  documentName: string;
  dataBase64: string;
}

// 80 mm roll / 72 mm printable area at 203 dpi (Xprinter 80 mm class).
const ESC_POS_PAPER_WIDTH_MM = 80;
const ESC_POS_PRINTABLE_WIDTH_MM = 72;
const ESC_POS_WIDTH_DOTS = 576;
const ESC_POS_MAX_HEIGHT_DOTS = 6000;
const ESC_POS_SIDE_MARGIN_DOTS = 16;

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
const band = (rightText: string, leftText: string, size = 9, filled = false): ReceiptBlock => ({
  kind: "band",
  rightText,
  leftText,
  size,
  filled
});
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
  await printEscPosDocuments(documents);
}

export async function printTestReceipt(
  kind: "customer" | "kitchen",
  printerName: string,
  settings: AppState["settings"]
) {
  const label = kind === "customer" ? "فاتورة العميل" : "ريسيت المطبخ";
  await printEscPosDocuments([{
    printerName,
    documentName: `Beitna printer test - ${label}`,
    paperWidthMm: ESC_POS_PAPER_WIDTH_MM,
    blocks: [
      text(settings.restaurantName, { align: "center", size: 13, bold: true }),
      text("اختبار الطابعة", { align: "center", size: 10, bold: true }),
      separator(),
      text(label, { align: "center", size: 10, bold: true }),
      text(shortDate(new Date().toISOString()), { align: "center", size: 8 }),
      space(),
      text(`ورق ${ESC_POS_PAPER_WIDTH_MM} مم • طباعة ${ESC_POS_PRINTABLE_WIDTH_MM} مم`, { align: "center", size: 8 }),
      text("تم الاتصال بالطابعة بنجاح", { align: "center", size: 9, bold: true }),
      separator()
    ]
  }]);
}

async function printEscPosDocuments(documents: ReceiptDocument[]) {
  await document.fonts.ready;
  const jobs: EscPosPrintJob[] = [];
  for (const receipt of documents) {
    const bytes = renderReceiptAsEscPos(receipt);
    jobs.push({
      printerName: receipt.printerName,
      documentName: receipt.documentName,
      dataBase64: bytesToBase64(bytes)
    });
  }
  await invoke("print_escpos_receipts", { jobs });
}

function renderReceiptAsEscPos(receipt: ReceiptDocument) {
  const canvas = document.createElement("canvas");
  canvas.width = ESC_POS_WIDTH_DOTS;
  canvas.height = ESC_POS_MAX_HEIGHT_DOTS;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("تعذر تجهيز صورة الفاتورة");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  context.textBaseline = "top";

  const margin = ESC_POS_SIDE_MARGIN_DOTS;
  const contentWidth = canvas.width - margin * 2;
  let y = 14;
  for (const block of receipt.blocks) {
    if (block.kind === "space") {
      y += Math.max(2, block.height * 1.6);
      continue;
    }
    if (block.kind === "separator") {
      y += 5;
      context.fillRect(margin, Math.round(y), contentWidth, 2);
      y += 10;
      continue;
    }
    if (block.kind === "columns") {
      let columnX = margin;
      let rowHeight = 0;
      for (const item of block.columns) {
        const width = contentWidth * Math.max(0.05, item.width);
        const height = drawWrappedText(context, item.text, columnX, y, width, item);
        rowHeight = Math.max(rowHeight, height);
        columnX += width;
      }
      y += rowHeight + 7;
      continue;
    }
    if (block.kind === "band") {
      const fontSize = Math.max(14, Math.round(block.size * 1.78));
      const bandHeight = Math.max(38, Math.ceil(fontSize * 2.15));
      y += 3;
      context.lineWidth = 2;
      if (block.filled) {
        context.fillStyle = "#000";
        context.fillRect(margin, y, contentWidth, bandHeight);
        context.fillStyle = "#fff";
      } else {
        context.strokeStyle = "#000";
        context.strokeRect(margin, y, contentWidth, bandHeight);
      }
      const textY = y + Math.max(3, Math.round((bandHeight - fontSize * 1.36) / 2));
      drawWrappedText(context, block.leftText, margin + 7, textY, contentWidth * 0.48 - 7, {
        align: "left", size: block.size, bold: true, rtl: false
      });
      drawWrappedText(context, block.rightText, margin + contentWidth * 0.48, textY, contentWidth * 0.52 - 7, {
        align: "right", size: block.size, bold: true, rtl: true
      });
      context.fillStyle = "#000";
      y += bandHeight + 8;
      continue;
    }
    y += drawWrappedText(context, block.text, margin, y, contentWidth, block) + 5;
  }

  const usedHeight = Math.min(canvas.height, Math.max(32, Math.ceil(y + 8)));
  const pixels = context.getImageData(0, 0, canvas.width, usedHeight).data;
  return encodeEscPosRaster(pixels, canvas.width, usedHeight);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  style: Pick<ReceiptColumn, "align" | "size" | "bold" | "rtl">
) {
  const fontSize = Math.max(14, Math.round(style.size * 1.78));
  context.font = `${style.bold ? 700 : 500} ${fontSize}px Cairo, Tahoma, sans-serif`;
  context.direction = style.rtl ? "rtl" : "ltr";
  context.textAlign = style.align === "center" ? "center" : style.align === "left" ? "left" : "right";
  const lineHeight = Math.ceil(fontSize * 1.36);
  const lines = wrapCanvasText(context, value, Math.max(20, width - 8));
  const textX = style.align === "center" ? x + width / 2 : style.align === "left" ? x + 4 : x + width - 4;
  lines.forEach((line, index) => context.fillText(line, textX, y + index * lineHeight, width - 8));
  return Math.max(lineHeight, lines.length * lineHeight);
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const paragraphs = String(value).split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function encodeEscPosRaster(pixels: Uint8ClampedArray, width: number, height: number) {
  const widthBytes = Math.ceil(width / 8);
  const output: number[] = [0x1b, 0x40];
  const chunkHeight = 192;
  for (let startY = 0; startY < height; startY += chunkHeight) {
    const rows = Math.min(chunkHeight, height - startY);
    output.push(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff);
    for (let row = 0; row < rows; row += 1) {
      const pixelY = startY + row;
      for (let byteX = 0; byteX < widthBytes; byteX += 1) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          const pixelX = byteX * 8 + bit;
          if (pixelX >= width) continue;
          const offset = (pixelY * width + pixelX) * 4;
          const luminance = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
          if (luminance < 190) byte |= 0x80 >> bit;
        }
        output.push(byte);
      }
    }
  }
  output.push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00);
  return Uint8Array.from(output);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function customerReceipt(order: Order, settings: AppState["settings"]): ReceiptDocument {
  const blocks: ReceiptBlock[] = [
    ...brandBlocks(settings),
    text("فاتورة بيع", { align: "center", size: 7, bold: true }),
    space(2),
    band(`طلب #${order.number}`, shortDate(order.createdAt), 9, true),
    ...(order.scheduledFor ? [columns(
      column(shortDate(order.scheduledFor), 0.58, { align: "left", size: 7 }),
      column("موعد التوصيل", 0.42, { size: 7, bold: true })
    )] : []),
    separator(),
    columns(
      column(order.customerPhone || "", 0.42, { align: "left", size: 8, rtl: false }),
      column(order.customerName, 0.58, { size: 9, bold: true })
    ),
    ...(order.address ? [text(order.address, { size: 7 })] : []),
    separator(),
    columns(
      column("الإجمالي", 0.25, { align: "center", size: 7, bold: true }),
      column("الصنف", 0.57, { align: "center", size: 7, bold: true }),
      column("عدد", 0.18, { align: "center", size: 7, bold: true })
    )
  ];

  order.items.forEach((item) => {
    blocks.push(columns(
      column(money(item.price * item.quantity), 0.25, { align: "center", size: 8, bold: true, rtl: false }),
      column(item.name, 0.57, { size: 8, bold: true }),
      column(String(item.quantity), 0.18, { align: "center", size: 8, bold: true, rtl: false })
    ));
    if (item.note) blocks.push(text(`ملاحظة: ${item.note}`, { size: 7 }));
  });

  blocks.push(
    separator(),
    summaryRow("المجموع", money(order.subtotal)),
    summaryRow("التوصيل", money(order.deliveryFee)),
    ...(order.discount > 0 ? [summaryRow("الخصم", `- ${money(order.discount)}`)] : []),
    space(3),
    band("الإجمالي", money(order.total), 10, true),
    ...(order.note ? [separator(), text(`ملاحظة الطلب: ${order.note}`, { size: 8, bold: true })] : []),
    separator(),
    text(settings.invoiceFooter, { align: "center", size: 8, bold: true }),
    space(6)
  );

  return {
    printerName: settings.customerReceiptPrinter ?? "",
    documentName: `فاتورة العميل #${order.number}`,
    paperWidthMm: ESC_POS_PAPER_WIDTH_MM,
    blocks
  };
}

function kitchenReceipt(order: Order, settings: AppState["settings"]): ReceiptDocument {
  const blocks: ReceiptBlock[] = [
    text(settings.restaurantName, { align: "center", size: 13, bold: true }),
    space(3),
    band("رقم الطلب", `#${order.number}`, 12, true),
    columns(
      column(shortDate(order.createdAt), 0.62, { align: "left", size: 8 }),
      column("وقت الطلب", 0.38, { size: 9, bold: true })
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
      column(item.name, 0.76, { size: 10, bold: true }),
      column(`${item.quantity}×`, 0.24, { align: "center", size: 11, bold: true, rtl: false })
    ));
    const details = item.mealComponents?.length
      ? item.mealComponents.map((component) => `${component.quantity}× ${component.name}`).join(" · ")
      : item.note;
    if (details) blocks.push(text(details, { size: 9, bold: true }));
    blocks.push(space(3));
  });

  blocks.push(
    separator(),
    band("إجمالي الوحدات", String(order.items.reduce((sum, item) => sum + item.quantity, 0)), 10, false),
    ...(order.note ? [separator(), text("ملاحظة الطلب", { size: 10, bold: true }), text(order.note, { size: 11, bold: true })] : []),
    space(8)
  );

  return {
    printerName: settings.kitchenReceiptPrinter ?? "",
    documentName: `ريسيت المطبخ #${order.number}`,
    paperWidthMm: ESC_POS_PAPER_WIDTH_MM,
    blocks
  };
}

function brandBlocks(settings: AppState["settings"]): ReceiptBlock[] {
  return [
    text(settings.restaurantName, { align: "center", size: 13, bold: true }),
    ...(settings.subtitle ? [text(settings.subtitle, { align: "center", size: 8 })] : []),
    ...(settings.phone ? [text(settings.phone, { align: "center", size: 7, rtl: false })] : []),
    ...(settings.address ? [text(settings.address, { align: "center", size: 7 })] : [])
  ];
}

function summaryRow(label: string, value: string): ReceiptBlock {
  return columns(
    column(value, 0.48, { align: "left", size: 8, bold: true, rtl: false }),
    column(label, 0.52, { size: 8 })
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
