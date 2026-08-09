import { useEffect, useRef, useState } from "react";
import { CookingPot, Printer, ReceiptText } from "lucide-react";
import type { AppState, Order } from "../../domain/types";
import { money, paymentLabels, shortDate } from "../../shared/format";
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
    <Modal title={`طباعة الطلب #${order.number}`} onClose={onClose}>
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

function ReceiptBrand({ settings, kind }: { settings: AppState["settings"]; kind?: string }) {
  return <header>
    {settings.logoDataUrl ? <img className="receipt-logo" src={settings.logoDataUrl} alt="" /> : <CookingPot />}
    <h2>{settings.restaurantName}</h2>
    {kind && <b className="receipt-kind">{kind}</b>}
    {!kind && <p>{settings.subtitle}</p>}
    {settings.phone && <small>{settings.phone}</small>}
    {settings.address && <small>{settings.address}</small>}
  </header>;
}

function CustomerReceipt({ order, settings }: { order: Order; settings: AppState["settings"] }) {
  return <div className="receipt-paper customer-receipt">
    <ReceiptBrand settings={settings} />
    <div className="receipt-meta">
      <span>رقم الطلب <b>#{order.number}</b></span>
      <span>التاريخ <b>{shortDate(order.createdAt)}</b></span>
      {order.scheduledFor && <span>موعد التوصيل <b>{shortDate(order.scheduledFor)}</b></span>}
      <span>الدفع <b>{paymentLabels[order.paymentMethod]} — {order.paymentStatus === "paid" ? "تم التحصيل" : "تحصيل معلق"}</b></span>
    </div>
    <div className="receipt-customer">
      <strong className="receipt-customer-line">{order.customerName}<span dir="ltr">{order.customerPhone}</span></strong>
      <p>{order.address}</p>
    </div>
    <table>
      <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th></tr></thead>
      <tbody>{order.items.map((item) => (
        <tr key={`${item.productId}:${item.optionId ?? "base"}`}>
          <td><strong>{item.name}</strong>{item.note && <small className="receipt-item-note">{item.note}</small>}</td>
          <td>{item.quantity}</td>
          <td>{money(item.price * item.quantity)}</td>
        </tr>
      ))}</tbody>
    </table>
    <div className="receipt-totals">
      <span>الأصناف <b>{money(order.subtotal)}</b></span>
      <span>التوصيل <b>{money(order.deliveryFee)}</b></span>
      {order.discount > 0 && <span>الخصم <b>- {money(order.discount)}</b></span>}
      <strong>الإجمالي <b>{money(order.total)}</b></strong>
    </div>
    <div className="receipt-footer">
      {order.note && <p>ملاحظة: {order.note}</p>}
      <small>{settings.invoiceFooter}</small>
    </div>
  </div>;
}

function KitchenReceipt({ order, settings }: { order: Order; settings: AppState["settings"] }) {
  return <div className="receipt-paper kitchen-receipt">
    <ReceiptBrand settings={settings} kind="ريسيت المطبخ" />
    <div className="receipt-meta kitchen-receipt-meta">
      <span>رقم الطلب <b>#{order.number}</b></span>
      <span>وقت الطلب <b>{shortDate(order.createdAt)}</b></span>
      <span>نوع الطلب <b>{order.scheduledFor ? "طلب مجدول" : "مطلوب الآن"}</b></span>
      {order.scheduledFor && <span>موعد التجهيز <b>{shortDate(order.scheduledFor)}</b></span>}
      <span>العميل <b>{order.customerName}</b></span>
    </div>
    <table className="kitchen-receipt-table">
      <thead><tr><th>الكمية</th><th>الصنف والتفاصيل</th></tr></thead>
      <tbody>{order.items.map((item) => {
        const details = item.mealComponents?.length
          ? item.mealComponents.map((component) => `${component.quantity}× ${component.name}`).join(" · ")
          : item.note;
        return <tr key={`${item.productId}:${item.optionId ?? "base"}`}>
          <td><b>{item.quantity}×</b></td>
          <td><strong>{item.name}</strong>{details && <small className="receipt-item-note">{details}</small>}</td>
        </tr>;
      })}</tbody>
    </table>
    <div className="kitchen-receipt-summary"><span>إجمالي الوحدات</span><b>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</b></div>
    {order.note && <div className="kitchen-receipt-note"><strong>ملاحظة الطلب</strong><p>{order.note}</p></div>}
    <div className="receipt-footer"><small>للتجهيز فقط — بدون أسعار</small></div>
  </div>;
}
