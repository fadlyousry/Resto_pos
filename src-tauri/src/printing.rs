use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscPosPrintJob {
    pub printer_name: String,
    pub document_name: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptColumn {
    pub text: String,
    pub width: f64,
    pub align: String,
    pub size: f64,
    pub bold: bool,
    pub rtl: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptBlock {
    pub kind: String,
    #[serde(default)]
    pub text: String,
    #[serde(default = "default_align")]
    pub align: String,
    #[serde(default = "default_font_size")]
    pub size: f64,
    #[serde(default)]
    pub bold: bool,
    #[serde(default = "default_rtl")]
    pub rtl: bool,
    #[serde(default)]
    pub height: f64,
    #[serde(default)]
    pub columns: Vec<ReceiptColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptPrintPayload {
    pub printer_name: String,
    pub document_name: String,
    pub paper_width_mm: f64,
    pub blocks: Vec<ReceiptBlock>,
}

fn default_align() -> String {
    "right".into()
}

fn default_font_size() -> f64 {
    10.0
}

fn default_rtl() -> bool {
    true
}

pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    let output = run_powershell(LIST_PRINTERS_SCRIPT, None)?;
    if output.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&output).map_err(|error| format!("تعذر قراءة قائمة الطابعات: {error}"))
}

pub fn print_receipt(payload: ReceiptPrintPayload) -> Result<(), String> {
    if payload.blocks.is_empty() {
        return Err("محتوى الريسيت فارغ".into());
    }
    let serialized = serde_json::to_string(&payload)
        .map_err(|error| format!("تعذر تجهيز بيانات الريسيت: {error}"))?;
    run_powershell(
        PRINT_RECEIPT_SCRIPT,
        Some((&"BEITNA_RECEIPT_JSON", &serialized)),
    )?;
    Ok(())
}

pub fn print_escpos_receipts(jobs: Vec<EscPosPrintJob>) -> Result<(), String> {
    if jobs.is_empty() {
        return Err("لا توجد فواتير للطباعة".into());
    }
    for job in jobs {
        let bytes = STANDARD
            .decode(&job.data_base64)
            .map_err(|error| format!("تعذر فك بيانات ESC/POS: {error}"))?;
        if bytes.is_empty() {
            return Err(format!("محتوى {} فارغ", job.document_name));
        }
        raw_print(&job.printer_name, &job.document_name, &bytes)?;
    }
    Ok(())
}

#[cfg(windows)]
fn raw_print(printer_name: &str, document_name: &str, bytes: &[u8]) -> Result<(), String> {
    use windows::{
        core::{PCWSTR, PWSTR},
        Win32::Graphics::Printing::{
            ClosePrinter, EndDocPrinter, EndPagePrinter, GetDefaultPrinterW, OpenPrinterW,
            StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_HANDLE,
        },
    };

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn default_printer() -> Result<String, String> {
        let mut length = 0u32;
        unsafe {
            let _ = GetDefaultPrinterW(None, &mut length);
        }
        if length == 0 {
            return Err("لا توجد طابعة افتراضية في Windows".into());
        }
        let mut buffer = vec![0u16; length as usize];
        if !unsafe { GetDefaultPrinterW(Some(PWSTR(buffer.as_mut_ptr())), &mut length) }.as_bool() {
            return Err(format!(
                "تعذر قراءة الطابعة الافتراضية: {}",
                windows::core::Error::from_win32()
            ));
        }
        let end = buffer
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(buffer.len());
        String::from_utf16(&buffer[..end]).map_err(|error| error.to_string())
    }

    let resolved_printer = if printer_name.trim().is_empty() {
        default_printer()?
    } else {
        printer_name.trim().to_string()
    };
    let printer_wide = wide(&resolved_printer);
    let mut handle = PRINTER_HANDLE::default();
    unsafe { OpenPrinterW(PCWSTR(printer_wide.as_ptr()), &mut handle, None) }
        .map_err(|error| format!("تعذر فتح الطابعة {resolved_printer}: {error}"))?;

    let mut document_wide = wide(document_name);
    let mut data_type_wide = wide("RAW");
    let document_info = DOC_INFO_1W {
        pDocName: PWSTR(document_wide.as_mut_ptr()),
        pOutputFile: PWSTR::null(),
        pDatatype: PWSTR(data_type_wide.as_mut_ptr()),
    };

    let result = unsafe {
        let job_id = StartDocPrinterW(handle, 1, &document_info);
        if job_id == 0 {
            Err(format!(
                "تعذر بدء مهمة الطباعة: {}",
                windows::core::Error::from_win32()
            ))
        } else if !StartPagePrinter(handle).as_bool() {
            let _ = EndDocPrinter(handle);
            Err(format!(
                "تعذر بدء صفحة الطباعة: {}",
                windows::core::Error::from_win32()
            ))
        } else {
            let mut written = 0u32;
            let write_ok = WritePrinter(
                handle,
                bytes.as_ptr().cast(),
                bytes
                    .len()
                    .try_into()
                    .map_err(|_| "حجم الفاتورة كبير جدًا")?,
                &mut written,
            )
            .as_bool();
            let write_error = if write_ok {
                None
            } else {
                Some(windows::core::Error::from_win32())
            };
            let page_ok = EndPagePrinter(handle).as_bool();
            let document_ok = EndDocPrinter(handle).as_bool();
            if !write_ok || written as usize != bytes.len() {
                Err(format!(
                    "فشل إرسال بيانات ESC/POS: {}",
                    write_error
                        .map(|error| error.to_string())
                        .unwrap_or_else(|| "لم تصل كل البيانات".into())
                ))
            } else if !page_ok || !document_ok {
                Err("وصلت البيانات لكن تعذر إغلاق مهمة الطباعة".into())
            } else {
                Ok(())
            }
        }
    };
    let _ = unsafe { ClosePrinter(handle) };
    result
}

#[cfg(not(windows))]
fn raw_print(_printer_name: &str, _document_name: &str, _bytes: &[u8]) -> Result<(), String> {
    Err("طباعة ESC/POS المباشرة متاحة على Windows فقط".into())
}

fn run_powershell(script: &str, environment: Option<(&str, &str)>) -> Result<String, String> {
    let utf16: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let encoded = STANDARD.encode(utf16);
    let mut command = Command::new("powershell.exe");
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        &encoded,
    ]);
    if let Some((key, value)) = environment {
        command.env(key, value);
    }
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|error| format!("تعذر تشغيل خدمة طباعة Windows: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        return Ok(stdout);
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        "فشلت مهمة الطباعة في Windows".into()
    } else {
        format!("فشلت مهمة الطباعة: {stderr}")
    })
}

const LIST_PRINTERS_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
$defaultPrinter = (New-Object System.Drawing.Printing.PrinterSettings).PrinterName
$printers = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object {
  [PSCustomObject]@{ name = [string]$_; isDefault = ([string]$_ -eq $defaultPrinter) }
})
ConvertTo-Json -InputObject $printers -Compress
"#;

const PRINT_RECEIPT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
trap { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
Add-Type -AssemblyName System.Drawing

$payload = $env:BEITNA_RECEIPT_JSON | ConvertFrom-Json
$settings = New-Object System.Drawing.Printing.PrinterSettings
if (-not [string]::IsNullOrWhiteSpace([string]$payload.printerName)) {
  $settings.PrinterName = [string]$payload.printerName
}
if (-not $settings.IsValid) {
  throw "الطابعة المحددة غير متاحة: $($payload.printerName)"
}

$paperWidthMm = [Math]::Max(58, [Math]::Min(110, [double]$payload.paperWidthMm))
$paperWidth = [int][Math]::Round(($paperWidthMm / 25.4) * 100)
$estimatedHeight = 110.0
foreach ($block in $payload.blocks) {
  if ($block.kind -eq 'separator') { $estimatedHeight += 10; continue }
  if ($block.kind -eq 'space') { $estimatedHeight += [Math]::Max(2, [double]$block.height); continue }
  if ($block.kind -eq 'columns') {
    $largest = 10.0
    foreach ($column in $block.columns) { $largest = [Math]::Max($largest, [double]$column.size) }
    $estimatedHeight += ($largest * 2.25) + 5
    continue
  }
  $estimatedHeight += ([Math]::Max(8, [double]$block.size) * 2.25) + 5
}
$paperHeight = [int][Math]::Max(350, [Math]::Min(3000, [Math]::Ceiling($estimatedHeight)))

$document = New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings = $settings
$document.DocumentName = [string]$payload.documentName
$document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$document.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Beitna Receipt', $paperWidth, $paperHeight)

$handler = [System.Drawing.Printing.PrintPageEventHandler]{
  param($sender, $eventArgs)
  $graphics = $eventArgs.Graphics
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $pageX = 5.0
  $pageY = 5.0
  $pageWidth = [Math]::Max(120.0, [double]$eventArgs.PageBounds.Width - 10.0)

  foreach ($block in $payload.blocks) {
    if ($block.kind -eq 'space') {
      $pageY += [Math]::Max(2.0, [double]$block.height)
      continue
    }
    if ($block.kind -eq 'separator') {
      $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
      $graphics.DrawLine($pen, $pageX, $pageY + 3, $pageX + $pageWidth, $pageY + 3)
      $pen.Dispose()
      $pageY += 9
      continue
    }
    if ($block.kind -eq 'columns') {
      $columnX = $pageX
      $rowHeight = 0.0
      foreach ($column in $block.columns) {
        $columnWidth = $pageWidth * [Math]::Max(0.05, [double]$column.width)
        $fontStyle = if ([bool]$column.bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
        $font = New-Object System.Drawing.Font('Tahoma', [single][Math]::Max(7, [double]$column.size), $fontStyle, [System.Drawing.GraphicsUnit]::Point)
        $format = New-Object System.Drawing.StringFormat
        if ([bool]$column.rtl) { $format.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft }
        if ($column.align -eq 'center') { $format.Alignment = [System.Drawing.StringAlignment]::Center }
        elseif ($column.align -eq 'left') { $format.Alignment = if ([bool]$column.rtl) { [System.Drawing.StringAlignment]::Far } else { [System.Drawing.StringAlignment]::Near } }
        else { $format.Alignment = if ([bool]$column.rtl) { [System.Drawing.StringAlignment]::Near } else { [System.Drawing.StringAlignment]::Far } }
        $measured = $graphics.MeasureString([string]$column.text, $font, [int][Math]::Max(20, $columnWidth), $format)
        $columnHeight = [Math]::Ceiling($measured.Height) + 3
        $rowHeight = [Math]::Max($rowHeight, $columnHeight)
        $rectangle = New-Object System.Drawing.RectangleF([single]$columnX, [single]$pageY, [single]$columnWidth, [single]$columnHeight)
        $graphics.DrawString([string]$column.text, $font, [System.Drawing.Brushes]::Black, $rectangle, $format)
        $font.Dispose()
        $format.Dispose()
        $columnX += $columnWidth
      }
      $pageY += $rowHeight + 2
      continue
    }

    $fontStyle = if ([bool]$block.bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = New-Object System.Drawing.Font('Tahoma', [single][Math]::Max(7, [double]$block.size), $fontStyle, [System.Drawing.GraphicsUnit]::Point)
    $format = New-Object System.Drawing.StringFormat
    if ([bool]$block.rtl) { $format.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft }
    if ($block.align -eq 'center') { $format.Alignment = [System.Drawing.StringAlignment]::Center }
    elseif ($block.align -eq 'left') { $format.Alignment = if ([bool]$block.rtl) { [System.Drawing.StringAlignment]::Far } else { [System.Drawing.StringAlignment]::Near } }
    else { $format.Alignment = if ([bool]$block.rtl) { [System.Drawing.StringAlignment]::Near } else { [System.Drawing.StringAlignment]::Far } }
    $measured = $graphics.MeasureString([string]$block.text, $font, [int]$pageWidth, $format)
    $lineHeight = [Math]::Ceiling($measured.Height) + 3
    $rectangle = New-Object System.Drawing.RectangleF([single]$pageX, [single]$pageY, [single]$pageWidth, [single]$lineHeight)
    $graphics.DrawString([string]$block.text, $font, [System.Drawing.Brushes]::Black, $rectangle, $format)
    $font.Dispose()
    $format.Dispose()
    $pageY += $lineHeight + 1
  }
  $eventArgs.HasMorePages = $false
}

$document.add_PrintPage($handler)
try { $document.Print() }
finally {
  $document.remove_PrintPage($handler)
  $document.Dispose()
}
"#;

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn reads_windows_printers() {
        let printers = list_printers().expect("Windows printer enumeration should succeed");
        assert!(printers
            .iter()
            .all(|printer| !printer.name.trim().is_empty()));
    }

    #[test]
    fn rejects_an_unavailable_printer_without_spooling() {
        let payload = ReceiptPrintPayload {
            printer_name: "__BEITNA_MISSING_PRINTER__".into(),
            document_name: "Beitna safe print test".into(),
            paper_width_mm: 80.0,
            blocks: vec![ReceiptBlock {
                kind: "text".into(),
                text: "اختبار".into(),
                align: "center".into(),
                size: 10.0,
                bold: true,
                rtl: true,
                height: 0.0,
                columns: Vec::new(),
            }],
        };
        let error = print_receipt(payload).expect_err("An unavailable printer must be rejected");
        assert!(error.contains("غير متاحة") || error.contains("failed"));
    }

    #[test]
    fn escpos_rejects_an_unavailable_printer_without_spooling() {
        let job = EscPosPrintJob {
            printer_name: "__BEITNA_MISSING_ESC_POS_PRINTER__".into(),
            document_name: "Beitna ESC POS safe test".into(),
            data_base64: STANDARD.encode([0x1b, 0x40, 0x0a]),
        };
        let error = print_escpos_receipts(vec![job])
            .expect_err("An unavailable raw printer must be rejected");
        assert!(error.contains("تعذر فتح الطابعة"));
    }
}
