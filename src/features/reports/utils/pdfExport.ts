import type { AppState } from "../../../domain/types";
import { currentArabicDate, shortDate } from "../../../shared/format";

export interface PrintReportOptions {
  title: string;
  subtitle?: string;
  dateRangeLabel: string;
  kpiCards?: Array<{ label: string; value: string; hint?: string }>;
  tables: Array<{
    title: string;
    headers: string[];
    rows: Array<Array<string | number>>;
    summaryRow?: Array<string | number>;
  }>;
}

export function printReportAsPdf(options: PrintReportOptions, state: AppState) {
  const { restaurantName, subtitle, phone, address, logoDataUrl } = state.settings;
  const now = new Date();
  const printTimeStr = shortDate(now.toISOString());
  const logoHtml = logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo" style="max-height: 50px; margin-bottom: 6px;" />` : "";

  const kpisHtml = options.kpiCards && options.kpiCards.length > 0
    ? `
      <div class="kpi-grid">
        ${options.kpiCards
          .map(
            (card) => `
          <div class="kpi-card">
            <span class="kpi-label">${card.label}</span>
            <strong class="kpi-value">${card.value}</strong>
            ${card.hint ? `<small class="kpi-hint">${card.hint}</small>` : ""}
          </div>
        `
          )
          .join("")}
      </div>
    `
    : "";

  const tablesHtml = options.tables
    .map(
      (table) => `
      <div class="report-section">
        <h3 class="section-title">${table.title}</h3>
        <table class="report-table">
          <thead>
            <tr>
              ${table.headers.map((h) => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${table.rows
              .map(
                (row) => `
              <tr>
                ${row.map((cell) => `<td>${cell}</td>`).join("")}
              </tr>
            `
              )
              .join("")}
            ${
              table.summaryRow
                ? `
              <tr class="summary-row">
                ${table.summaryRow.map((cell) => `<td><strong>${cell}</strong></td>`).join("")}
              </tr>
            `
                : ""
            }
          </tbody>
        </table>
      </div>
    `
    )
    .join("");

  const fullHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${options.title} - ${restaurantName || "Resto POS"}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    body {
      background: #ffffff;
      color: #1a202c;
      padding: 28px;
      font-size: 13px;
      line-height: 1.5;
    }

    .report-container {
      max-width: 960px;
      margin: 0 auto;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #254d3e;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }

    .brand-info h1 {
      font-size: 24px;
      color: #1a382f;
      font-weight: 800;
      margin-bottom: 4px;
    }

    .brand-info p {
      font-size: 13px;
      color: #4a5568;
    }

    .report-meta {
      text-align: left;
    }

    .report-meta .report-title-badge {
      display: inline-block;
      background: #254d3e;
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 15px;
      margin-bottom: 6px;
    }

    .report-meta .meta-date {
      font-size: 12px;
      color: #718096;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }

    .kpi-card {
      background: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      text-align: center;
    }

    .kpi-label {
      display: block;
      font-size: 12px;
      color: #718096;
      margin-bottom: 6px;
    }

    .kpi-value {
      display: block;
      font-size: 20px;
      color: #1a382f;
      font-weight: 700;
    }

    .kpi-hint {
      display: block;
      font-size: 11px;
      color: #a0aec0;
      margin-top: 4px;
    }

    .report-section {
      margin-bottom: 26px;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 16px;
      color: #1a382f;
      font-weight: 700;
      margin-bottom: 10px;
      border-right: 4px solid #d97706;
      padding-right: 8px;
    }

    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: right;
    }

    .report-table th {
      background: #edf2f7;
      color: #2d3748;
      font-weight: 700;
      padding: 10px 12px;
      border-bottom: 2px solid #cbd5e0;
    }

    .report-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #e2e8f0;
      color: #2d3748;
    }

    .report-table tbody tr:nth-child(even) {
      background: #fbfcfe;
    }

    .report-table .summary-row td {
      background: #edf2f7;
      border-top: 2px solid #a0aec0;
      border-bottom: 2px solid #a0aec0;
      font-weight: 700;
      color: #1a382f;
    }

    .report-footer {
      margin-top: 35px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #a0aec0;
    }

    @media print {
      body {
        padding: 0;
      }
      .report-container {
        max-width: 100%;
      }
      .report-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <header class="report-header">
      <div class="brand-info">
        ${logoHtml}
        <h1>${restaurantName || "نظام إدارة المطاعم"}</h1>
        ${subtitle ? `<p>${subtitle}</p>` : ""}
        ${phone || address ? `<p>${[phone, address].filter(Boolean).join(" · ")}</p>` : ""}
      </div>
      <div class="report-meta">
        <div class="report-title-badge">${options.title}</div>
        <div class="meta-date">الفترة: <strong>${options.dateRangeLabel}</strong></div>
        <div class="meta-date">تاريخ الطباعة: ${printTimeStr}</div>
      </div>
    </header>

    ${kpisHtml}
    ${tablesHtml}

    <footer class="report-footer">
      <span>تم استخراج هذا التقرير تلقائيًا من نظام Resto POS</span>
      <span>${currentArabicDate()}</span>
    </footer>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.print();
      }, 350);
    });
  </script>
</body>
</html>
  `;

  // Open clean printable window
  const printWindow = window.open("", "_blank", "width=1024,height=800");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  } else {
    // Fallback if popup blocked: create hidden iframe and print
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(fullHtml);
      doc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }
  }
}
