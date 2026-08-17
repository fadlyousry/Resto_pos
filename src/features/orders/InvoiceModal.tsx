import { useEffect, useRef, useState } from "react";
import { CookingPot, Printer, ReceiptText } from "lucide-react";
import type { AppState, Order } from "../../domain/types";
import { money, orderDisplayNumber, shortDate } from "../../shared/format";
import { Modal } from "../../shared/ui";
import { errorMessage, isDesktopRuntime, printOrderReceipts } from "../../infrastructure/desktopPrinting";

export function InvoiceModal({ order, settings, onClose, autoPrint = false }: {
  order: Order;
  settings: AppState["settings"];
  onClose: () => void;
  autoPrint?: boolean;
}) {
  const autoPrinted = useRef(false);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const printCustomerReceipt = settings.printCustomerReceipt !== false;
  const printKitchenReceipt = settings.printKitchenReceipt !== false;
  const receiptCount = Number(printCustomerReceipt) + Number(printKitchenReceipt);

  const printReceipts = async () => {
    if (!receiptCount) return;
    if (isDesktopRuntime()) {
      setPrinting(true);
      setPrintError("");
      try {
        await printOrderReceipts(order, settings);
      } catch (error) {
        setPrintError(errorMessage(error));
      } finally {
        setPrinting(false);
      }
      return;
    }
    const cleanup = () => document.body.classList.remove("print-receipt");
    document.body.classList.add("print-receipt");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 750);
  };

  useEffect(() => {
    if (!autoPrint || autoPrinted.current || !receiptCount) return;
    autoPrinted.current = true;
    const timer = window.setTimeout(() => void printReceipts(), 180);
    return () => window.clearTimeout(timer);
  }, [autoPrint, order.id, receiptCount]);

  return (
    <Modal title={`طباعة الطلب #${orderDisplayNumber(order)}`} onClose={onClose}>
      <div className="receipt-print-stack">
        {printCustomerReceipt && <section className="receipt-preview">
          <span className="receipt-preview-label"><ReceiptText /> فاتورة العميل</span>
          <CustomerReceipt order={order} settings={settings} />
        </section>}
        {printKitchenReceipt && <section className="receipt-preview">
          <span className="receipt-preview-label kitchen"><CookingPot /> ريسيت المطبخ</span>
          <KitchenReceipt order={order} settings={settings} />
        </section>}
        {!receiptCount && <div className="receipt-print-disabled"><Printer /><strong>الطباعة متوقفة</strong><small>فعّل فاتورة العميل أو ريسيت المطبخ من الإعدادات.</small></div>}
      </div>
      {printError && <p className="receipt-print-error">تعذرت الطباعة: {printError}</p>}
      <button className="primary-button print-receipt-button" disabled={!receiptCount || printing} onClick={() => void printReceipts()}><Printer /> {printing ? "جاري إرسال الريسيت للطابعة..." : receiptCount === 2 ? "طباعة ريسيت العميل والمطبخ" : printCustomerReceipt ? "طباعة فاتورة العميل" : "طباعة ريسيت المطبخ"}</button>
    </Modal>
  );
}

function ReceiptBrand({ settings, kind }: { settings: AppState["settings"]; kind?: string | null }) {
  return <header>
    {settings.logoDataUrl ? <img className="receipt-logo" src={settings.logoDataUrl} alt="" /> : <CookingPot />}
    <h2>{settings.restaurantName}</h2>
    {kind === undefined && <p>{settings.subtitle}</p>}
    {(settings.phone || settings.address) && <div className="receipt-brand-contact">
      {settings.phone && <small dir="ltr">{settings.phone}</small>}
      {settings.address && <small>{settings.address}</small>}
    </div>}
    {kind !== null && <b className={kind ? "receipt-kind" : "receipt-document-type"}>{kind ?? "فاتورة بيع"}</b>}
  </header>;
}

function CustomerReceipt({ order, settings }: { order: Order; settings: AppState["settings"] }) {
  return <div className="receipt-paper customer-receipt">
    <ReceiptBrand settings={settings} />
    <div className="receipt-order-hero">
      <div><span>رقم الطلب</span><strong>#{orderDisplayNumber(order)}</strong></div>
      <div className="receipt-order-date"><span>تاريخ الطلب</span><time>{shortDate(order.createdAt)}</time></div>
    </div>
    {order.scheduledFor && <div className="receipt-scheduled"><span>موعد التوصيل</span><b>{shortDate(order.scheduledFor)}</b></div>}
    <div className="receipt-section-label">بيانات العميل</div>
    <div className="receipt-customer">
      <strong className="receipt-customer-line">{order.customerName}<span dir="ltr">{order.customerPhone}</span></strong>
      <p>{order.address}</p>
    </div>
    <div className="receipt-section-label">تفاصيل الطلب</div>
    <table className="customer-receipt-table">
      <thead><tr><th>الصنف</th><th>العدد</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>{order.items.map((item) => (
        <tr key={`${item.productId}:${item.optionId ?? "base"}`}>
          <td><strong>{item.name}</strong>{item.note && <small className="receipt-item-note">{item.note}</small>}</td>
          <td>{item.quantity}</td>
          <td>{money(item.price)}</td>
          <td>{money(item.price * item.quantity)}</td>
        </tr>
      ))}</tbody>
    </table>
    <div className="receipt-totals">
      <span>المجموع <b>{money(order.subtotal)}</b></span>
      <span>التوصيل <b>{money(order.deliveryFee)}</b></span>
      {order.discount > 0 && <span>الخصم <b>- {money(order.discount)}</b></span>}
      <strong className="receipt-grand-total"><span>الإجمالي</span><b>{money(order.total)}</b></strong>
    </div>
    <div className="receipt-footer">
      {order.note && <p>ملاحظة: {order.note}</p>}
      <small>{settings.invoiceFooter}</small>
    </div>
  </div>;
}

function KitchenReceipt({ order, settings }: { order: Order; settings: AppState["settings"] }) {
  return <div className="receipt-paper kitchen-receipt">
    <ReceiptBrand settings={settings} kind={null} />
    <div className="kitchen-order-hero">
      <div><span>رقم الطلب</span><strong>#{orderDisplayNumber(order)}</strong></div>
      <time><span>وقت الطلب</span><b>{shortDate(order.createdAt)}</b></time>
    </div>
    {order.scheduledFor && <div className="kitchen-scheduled"><span>موعد التجهيز</span><b>{shortDate(order.scheduledFor)}</b></div>}
    <div className="kitchen-customer"><span>العميل</span><strong>{order.customerName}</strong></div>
    <div className="receipt-section-label kitchen-section-label">الأصناف المطلوبة</div>
    <table className="kitchen-receipt-table">
      <thead><tr><th>الكمية</th><th>الصنف والتفاصيل</th></tr></thead>
      <tbody>{order.items.map((item) => {
        const details = item.mealComponents?.length
          ? item.mealComponents.map((component) => `${component.quantity}× ${component.name}${component.optionName ? ` (${component.optionName})` : ""}`).join(" · ")
          : item.note;
        return <tr key={`${item.productId}:${item.optionId ?? "base"}`}>
          <td><b>{item.quantity}×</b></td>
          <td><strong>{item.name}</strong>{details && <small className="receipt-item-note">{details}</small>}</td>
        </tr>;
      })}</tbody>
    </table>
    <div className="kitchen-receipt-summary"><span>إجمالي الوحدات</span><b>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</b></div>
    {order.note && <div className="kitchen-receipt-note"><strong>ملاحظة الطلب</strong><p>{order.note}</p></div>}
  </div>;
}
