import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppState, Order } from "../domain/types";
import { money, orderDisplayNumber, shortDate } from "../shared/format";

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
  | { kind: "tableHeader"; columns: ReceiptColumn[] }
  | { kind: "band"; leftText: string; rightText: string; size: number; filled: boolean }
  | { kind: "image"; src: string; width: number; height: number }
  | { kind: "section"; text: string }
  | { kind: "customer"; name: string; phone: string; address: string; notes?: string }
  | { kind: "orderHero"; orderNumber: number; createdAt: string }
  | { kind: "kitchenHero"; orderNumber: number }
  | { kind: "kitchenTable"; items: { name: string; quantity: number; details?: string }[] }
  | { kind: "kitchenNote"; text: string }
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
// Typography is authored in points. XPrinter 80 mm printers are normally 203 dpi,
// so a point is 203 / 72 = 2.82 printer dots. A small optical correction keeps
// Cairo bold text crisp without making the receipt excessively tall.
const ESC_POS_DOTS_PER_POINT = 2.7;

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
const tableHeader = (...items: ReceiptColumn[]): ReceiptBlock => ({ kind: "tableHeader", columns: items });
const band = (rightText: string, leftText: string, size = 9, filled = false): ReceiptBlock => ({
  kind: "band",
  rightText,
  leftText,
  size,
  filled
});
const imageBlock = (src: string, width = 230, height = 180): ReceiptBlock => ({ kind: "image", src, width, height });
const sectionLabel = (value: string): ReceiptBlock => ({ kind: "section", text: value });
const customerCard = (name: string, phone: string, address: string, notes?: string): ReceiptBlock => ({
  kind: "customer", name, phone, address, notes
});
const orderHero = (orderNumber: number, createdAt: string): ReceiptBlock => ({ kind: "orderHero", orderNumber, createdAt });
const kitchenHero = (orderNumber: number): ReceiptBlock => ({ kind: "kitchenHero", orderNumber });
const kitchenTable = (
  items: { name: string; quantity: number; details?: string }[]
): ReceiptBlock => ({ kind: "kitchenTable", items });
const kitchenNote = (noteText: string): ReceiptBlock => ({ kind: "kitchenNote", text: noteText });
const separator = (): ReceiptBlock => ({ kind: "separator" });
const space = (height = 5): ReceiptBlock => ({ kind: "space", height });

export const isDesktopRuntime = () => isTauri();

export async function listDesktopPrinters(): Promise<PrinterInfo[]> {
  if (!isDesktopRuntime()) return [];
  return invoke<PrinterInfo[]>("list_printers");
}

export async function printOrderReceipts(order: Order, settings: AppState["settings"], customers?: AppState["customers"]) {
  if (!isDesktopRuntime()) throw new Error("الطباعة المباشرة متاحة في نسخة الديسكتوب فقط");
  const documents: ReceiptDocument[] = [];
  if (settings.printCustomerReceipt !== false) documents.push(customerReceipt(order, settings, customers));
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
  await ensureReceiptFonts();
  const jobs: EscPosPrintJob[] = [];
  for (const receipt of documents) {
    const bytes = await renderReceiptAsEscPos(receipt);
    jobs.push({
      printerName: receipt.printerName,
      documentName: receipt.documentName,
      dataBase64: bytesToBase64(bytes)
    });
  }
  await invoke("print_escpos_receipts", { jobs });
}

async function renderReceiptAsEscPos(receipt: ReceiptDocument) {
  const { canvas, usedHeight } = await renderReceiptCanvas(receipt);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("تعذر تجهيز صورة الفاتورة");
  const pixels = context.getImageData(0, 0, canvas.width, usedHeight).data;
  return encodeEscPosRaster(pixels, canvas.width, usedHeight);
}

async function renderReceiptCanvas(receipt: ReceiptDocument) {
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
    if (block.kind === "image") {
      const receiptImage = await loadReceiptImage(block.src).catch(() => null);
      if (receiptImage) {
        const maxWidth = Math.min(contentWidth, block.width);
        const maxHeight = block.height;
        const naturalWidth = receiptImage.naturalWidth || receiptImage.width || maxWidth;
        const naturalHeight = receiptImage.naturalHeight || receiptImage.height || maxHeight;
        const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
        const width = Math.max(10, Math.round(naturalWidth * scale));
        const height = Math.max(10, Math.round(naturalHeight * scale));
        const imageX = margin + (contentWidth - width) / 2;
        context.drawImage(receiptImage, imageX, y, width, height);
        y += height + 8;
      }
      continue;
    }
    if (block.kind === "section") {
      const labelWidth = Math.min(contentWidth * 0.47, 190);
      const labelHeight = drawWrappedText(context, block.text, margin + contentWidth - labelWidth, y, labelWidth, {
        align: "right", size: 7.5, bold: true, rtl: true
      });
      const lineY = y + Math.round(labelHeight / 2);
      context.fillRect(margin, lineY, Math.max(20, contentWidth - labelWidth - 10), 2);
      y += labelHeight + 8;
      continue;
    }
    if (block.kind === "orderHero") {
      const heroHeight = 82;
      const heroX = margin;
      const halfWidth = contentWidth / 2;
      context.fillStyle = "#000";
      roundedRect(context, heroX, y, contentWidth, heroHeight, 10);
      context.fill();
      context.fillStyle = "#fff";
      drawWrappedText(context, "رقم الطلب", heroX + halfWidth, y + 8, halfWidth - 10, {
        align: "right", size: 6.5, bold: true, rtl: true
      });
      drawWrappedText(context, `#${block.orderNumber}`, heroX + halfWidth, y + 35, halfWidth - 10, {
        align: "right", size: 11, bold: true, rtl: false
      });
      drawWrappedText(context, "تاريخ الطلب", heroX + 10, y + 8, halfWidth - 10, {
        align: "left", size: 6.5, bold: true, rtl: true
      });
      drawWrappedText(context, block.createdAt, heroX + 10, y + 36, halfWidth - 10, {
        align: "left", size: 6.5, bold: true, rtl: true
      });
      context.fillStyle = "#000";
      y += heroHeight + 10;
      continue;
    }
    if (block.kind === "kitchenHero") {
      const heroHeight = 94;
      const heroX = margin;
      context.fillStyle = "#000";
      roundedRect(context, heroX, y, contentWidth, heroHeight, 10);
      context.fill();
      context.fillStyle = "#fff";
      drawWrappedText(context, `#${block.orderNumber}`, heroX, y + 18, contentWidth, {
        align: "center", size: 24, bold: true, rtl: false
      });
      context.fillStyle = "#000";
      y += heroHeight + 10;
      continue;
    }
    if (block.kind === "kitchenTable") {
      const qtyWidth = Math.round(contentWidth * 0.24);
      const itemWidth = contentWidth - qtyWidth;
      const splitX = margin + qtyWidth;
      context.lineWidth = 2;
      context.strokeStyle = "#000";

      // 1. Table Header
      const headerHeight = 36;
      context.strokeRect(margin, y, contentWidth, headerHeight);
      context.beginPath();
      context.moveTo(splitX, y);
      context.lineTo(splitX, y + headerHeight);
      context.stroke();

      drawWrappedText(context, "الكمية", margin, y + 6, qtyWidth, {
        align: "center", size: 9, bold: true, rtl: true
      });
      drawWrappedText(context, "الصنف والتفاصيل", splitX, y + 6, itemWidth, {
        align: "center", size: 9, bold: true, rtl: true
      });
      y += headerHeight;

      // 2. Table Rows
      for (const item of block.items) {
        const itemLines = wrapCanvasText(context, item.name, itemWidth - 16);
        const nameHeight = itemLines.length * Math.ceil(receiptFontSize(10.5) * 1.36);
        let detailsHeight = 0;
        if (item.details) {
          const detailLines = wrapCanvasText(context, item.details, itemWidth - 24);
          detailsHeight = detailLines.length * Math.ceil(receiptFontSize(8.5) * 1.36) + 12;
        }
        const rowHeight = Math.max(38, nameHeight + detailsHeight + 14);

        // Row outline and vertical column separator
        context.lineWidth = 2;
        context.strokeStyle = "#000";
        context.strokeRect(margin, y, contentWidth, rowHeight);
        context.beginPath();
        context.moveTo(splitX, y);
        context.lineTo(splitX, y + rowHeight);
        context.stroke();

        // Quantity in left column (centered vertically and horizontally)
        const qtyFontSize = 13;
        const qtyFontHeight = Math.ceil(receiptFontSize(qtyFontSize) * 1.36);
        const qtyY = y + Math.max(4, Math.round((rowHeight - qtyFontHeight) / 2));
        drawWrappedText(context, `${item.quantity}×`, margin, qtyY, qtyWidth, {
          align: "center", size: qtyFontSize, bold: true, rtl: false
        });

        // Item name in right column
        let textY = y + 7;
        const drawnNameHeight = drawWrappedText(context, item.name, splitX, textY, itemWidth - 10, {
          align: "right", size: 10.5, bold: true, rtl: true
        });
        textY += drawnNameHeight + 4;

        if (item.details) {
          const detailLines = wrapCanvasText(context, item.details, itemWidth - 24);
          const detailTextHeight = detailLines.length * Math.ceil(receiptFontSize(8.5) * 1.36);
          const bubbleHeight = detailTextHeight + 10;
          const bubbleWidth = itemWidth - 14;
          const bubbleX = splitX + 7;
          const bubbleY = textY;

          context.fillStyle = createHalftonePattern(context);
          roundedRect(context, bubbleX, bubbleY, bubbleWidth, bubbleHeight, 6);
          context.fill();

          context.lineWidth = 1.5;
          context.strokeStyle = "#000";
          roundedRect(context, bubbleX, bubbleY, bubbleWidth, bubbleHeight, 6);
          context.stroke();

          context.fillStyle = "#000";
          drawWrappedText(context, item.details, bubbleX + 5, bubbleY + 5, bubbleWidth - 10, {
            align: "right", size: 8.5, bold: true, rtl: true
          });
        }

        y += rowHeight;
      }

      y += 6;
      continue;
    }
    if (block.kind === "kitchenNote") {
      const noteLines = wrapCanvasText(context, block.text, contentWidth - 28);
      const noteTextHeight = noteLines.length * Math.ceil(receiptFontSize(11) * 1.36);
      const badgeHeight = 28;
      const boxHeight = badgeHeight + noteTextHeight + 20;
      const boxX = margin;

      // 1. Shaded Halftone Background
      context.fillStyle = createHalftonePattern(context);
      roundedRect(context, boxX, y, contentWidth, boxHeight, 8);
      context.fill();

      // 2. Crisp Solid Black Outer Border
      context.lineWidth = 2;
      context.strokeStyle = "#000";
      roundedRect(context, boxX, y, contentWidth, boxHeight, 8);
      context.stroke();

      // 3. Black Badge for "ملاحظة الطلب" Header
      const badgeWidth = 140;
      const badgeX = boxX + contentWidth - badgeWidth - 8;
      const badgeY = y + 8;
      context.fillStyle = "#000";
      roundedRect(context, badgeX, badgeY, badgeWidth, badgeHeight, 4);
      context.fill();

      context.fillStyle = "#fff";
      drawWrappedText(context, "ملاحظة الطلب", badgeX, badgeY + 4, badgeWidth, {
        align: "center", size: 8.5, bold: true, rtl: true
      });

      // 4. Large Bold Black Note Text
      context.fillStyle = "#000";
      drawWrappedText(context, block.text, boxX + 14, y + badgeHeight + 14, contentWidth - 28, {
        align: "right", size: 11, bold: true, rtl: true
      });

      y += boxHeight + 10;
      continue;
    }
    if (block.kind === "customer") {
      const nameSize = 9;
      const detailsSize = 7.5;
      const nameHeight = Math.ceil(receiptFontSize(nameSize) * 1.36);
      context.font = `500 ${receiptFontSize(detailsSize)}px "Cairo", Tahoma, sans-serif`;
      const addressLines = block.address ? wrapCanvasText(context, block.address, contentWidth - 28) : [];
      const addressHeight = addressLines.length ? addressLines.length * Math.ceil(receiptFontSize(detailsSize) * 1.36) : 0;
      const notesLines = block.notes ? wrapCanvasText(context, `ملاحظات: ${block.notes}`, contentWidth - 28) : [];
      const notesHeight = notesLines.length ? notesLines.length * Math.ceil(receiptFontSize(detailsSize) * 1.36) : 0;
      const cardHeight = 20 + nameHeight + (addressHeight ? addressHeight + 5 : 0) + (notesHeight ? notesHeight + 5 : 0);
      context.lineWidth = 2;
      context.strokeStyle = "#999";
      roundedRect(context, margin, y, contentWidth, cardHeight, 10);
      context.stroke();
      drawWrappedText(context, block.phone, margin + 10, y + 9, contentWidth * 0.42, {
        align: "left", size: 8, bold: false, rtl: false
      });
      drawWrappedText(context, block.name, margin + contentWidth * 0.42, y + 9, contentWidth * 0.58 - 10, {
        align: "right", size: nameSize, bold: true, rtl: true
      });
      let currentOffset = y + 12 + nameHeight;
      if (block.address) {
        const drawnHeight = drawWrappedText(context, block.address, margin + 10, currentOffset, contentWidth - 20, {
          align: "right", size: detailsSize, bold: false, rtl: true
        });
        currentOffset += drawnHeight + 4;
      }
      if (block.notes) {
        drawWrappedText(context, `ملاحظات: ${block.notes}`, margin + 10, currentOffset, contentWidth - 20, {
          align: "right", size: detailsSize, bold: true, rtl: true
        });
      }
      context.strokeStyle = "#000";
      y += cardHeight + 10;
      continue;
    }
    if (block.kind === "tableHeader") {
      const headerHeight = Math.max(
        40,
        ...block.columns.map((item) => Math.ceil(receiptFontSize(item.size) * 1.36) + 12)
      );
      context.lineWidth = 2;
      context.strokeStyle = "#000";
      roundedRect(context, margin, y, contentWidth, headerHeight, 6);
      context.stroke();
      let columnX = margin;
      for (const item of block.columns) {
        const width = contentWidth * Math.max(0.05, item.width);
        drawWrappedText(context, item.text, columnX, y + 6, width, item);
        columnX += width;
      }
      y += headerHeight + 8;
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
      const fontSize = receiptFontSize(block.size);
      const bandHeight = Math.max(38, Math.ceil(fontSize * 2.15));
      y += 3;
      context.lineWidth = 2;
      if (block.filled) {
        context.fillStyle = "#000";
        roundedRect(context, margin, y, contentWidth, bandHeight, 10);
        context.fill();
        context.fillStyle = "#fff";
      } else {
        context.strokeStyle = "#000";
        roundedRect(context, margin, y, contentWidth, bandHeight, 10);
        context.stroke();
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
  return { canvas, usedHeight };
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  style: Pick<ReceiptColumn, "align" | "size" | "bold" | "rtl">
) {
  const fontSize = receiptFontSize(style.size);
  context.font = `${style.bold ? 700 : 500} ${fontSize}px "Cairo", Tahoma, sans-serif`;
  context.direction = style.rtl ? "rtl" : "ltr";
  context.textAlign = style.align === "center" ? "center" : style.align === "left" ? "left" : "right";
  const lineHeight = Math.ceil(fontSize * 1.36);
  const lines = wrapCanvasText(context, value, Math.max(20, width - 8));
  const textX = style.align === "center" ? x + width / 2 : style.align === "left" ? x + 4 : x + width - 4;
  lines.forEach((line, index) => context.fillText(line, textX, y + index * lineHeight, width - 8));
  return Math.max(lineHeight, lines.length * lineHeight);
}

function receiptFontSize(points: number) {
  return Math.max(17, Math.round(points * ESC_POS_DOTS_PER_POINT));
}

async function ensureReceiptFonts() {
  await Promise.all([
    document.fonts.load('500 32px "Cairo"', "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"),
    document.fonts.load('700 32px "Cairo"', "ابتثجحخدذرزسشصضطظعغفقكلمنهوي")
  ]);
  await document.fonts.ready;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function loadReceiptImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const receiptImage = new Image();
    receiptImage.onload = () => resolve(receiptImage);
    receiptImage.onerror = () => reject(new Error("تعذر تحميل شعار الفاتورة"));
    receiptImage.src = source;
  });
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

function createHalftonePattern(context: CanvasRenderingContext2D) {
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 4;
  patternCanvas.height = 4;
  const pctx = patternCanvas.getContext("2d");
  if (!pctx) return "#ddd";
  pctx.fillStyle = "#fff";
  pctx.fillRect(0, 0, 4, 4);
  pctx.fillStyle = "#000";
  pctx.fillRect(0, 0, 1, 1);
  pctx.fillRect(2, 2, 1, 1);
  return context.createPattern(patternCanvas, "repeat") || "#ddd";
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

function customerReceipt(order: Order, settings: AppState["settings"], customers?: AppState["customers"]): ReceiptDocument {
  const customerNotes = order.customerNotes || customers?.find((c) => c.id === order.customerId)?.notes;
  const blocks: ReceiptBlock[] = [
    ...brandBlocks(settings),
    orderHero(orderDisplayNumber(order), shortDate(order.createdAt)),
    ...(order.scheduledFor ? [columns(
      column(shortDate(order.scheduledFor), 0.58, { align: "left", size: 7 }),
      column("موعد التوصيل", 0.42, { size: 7, bold: true })
    )] : []),
    sectionLabel("بيانات العميل"),
    customerCard(order.customerName, order.customerPhone || "", order.address || "", customerNotes),
    sectionLabel("تفاصيل الطلب"),
    tableHeader(
      column("الإجمالي", 0.23, { align: "center", size: 7, bold: true }),
      column("السعر", 0.2, { align: "center", size: 7, bold: true }),
      column("العدد", 0.14, { align: "center", size: 7, bold: true }),
      column("اسم الصنف", 0.43, { align: "center", size: 7, bold: true })
    )
  ];

  order.items.forEach((item) => {
    blocks.push(columns(
      column(money(item.price * item.quantity), 0.23, { align: "center", size: 8, bold: true, rtl: false }),
      column(money(item.price), 0.2, { align: "center", size: 8, bold: true, rtl: false }),
      column(String(item.quantity), 0.14, { align: "center", size: 8, bold: true, rtl: false }),
      column(item.name, 0.43, { size: 8, bold: true })
    ));
  });

  blocks.push(
    separator(),
    summaryRow("المجموع", money(order.subtotal)),
    summaryRow("التوصيل", money(order.deliveryFee)),
    ...(order.discount > 0 ? [summaryRow("الخصم", `- ${money(order.discount)}`)] : []),
    space(3),
    band("الإجمالي", money(order.total), 10, true),
    ...(order.note ? [text(`ملاحظة الطلب: ${order.note}`, { align: "center", size: 8, bold: true })] : []),
    text(settings.invoiceFooter, { align: "center", size: 7, bold: true }),
    space(6)
  );

  return {
    printerName: settings.customerReceiptPrinter ?? "",
    documentName: `فاتورة العميل #${orderDisplayNumber(order)}`,
    paperWidthMm: ESC_POS_PAPER_WIDTH_MM,
    blocks
  };
}

function kitchenReceipt(order: Order, settings: AppState["settings"]): ReceiptDocument {
  const tableItems = order.items.map((item) => {
    const details = item.mealComponents?.length
      ? item.mealComponents.map((component) => `${component.quantity}× ${component.name}${component.optionName ? ` (${component.optionName})` : ""}`).join(" · ")
      : item.note;
    return {
      name: item.name,
      quantity: item.quantity,
      details: details || undefined
    };
  });

  const blocks: ReceiptBlock[] = [
    text(settings.restaurantName, { align: "center", size: 13, bold: true }),
    space(3),
    kitchenHero(orderDisplayNumber(order)),
    space(2),
    columns(
      column(shortDate(order.createdAt), 0.62, { align: "left", size: 8 }),
      column("وقت الطلب", 0.38, { size: 9, bold: true })
    ),
    ...(order.scheduledFor ? [columns(
      column(shortDate(order.scheduledFor), 0.62, { align: "left", size: 9, bold: true }),
      column("موعد التجهيز", 0.38, { size: 9, bold: true })
    )] : []),
    columns(
      column(order.customerName, 0.62, { align: "left", size: 9, bold: true }),
      column("العميل", 0.38, { size: 9, bold: true })
    ),
    space(4),
    kitchenTable(tableItems),
    ...(order.note ? [space(12), kitchenNote(order.note)] : []),
    space(8)
  ];

  return {
    printerName: settings.kitchenReceiptPrinter ?? "",
    documentName: `ريسيت المطبخ #${orderDisplayNumber(order)}`,
    paperWidthMm: ESC_POS_PAPER_WIDTH_MM,
    blocks
  };
}

function brandBlocks(settings: AppState["settings"]): ReceiptBlock[] {
  return [
    ...(settings.logoDataUrl ? [imageBlock(settings.logoDataUrl, 240, 200)] : []),
    text(settings.restaurantName, { align: "center", size: 13, bold: true }),
    ...(settings.subtitle ? [text(settings.subtitle, { align: "center", size: 8.5 })] : []),
    ...(settings.phone ? [text(settings.phone, { align: "center", size: 7, rtl: false })] : []),
    ...(settings.address ? [text(settings.address, { align: "center", size: 7.5 })] : [])
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
