import { CookingPot, Printer } from "lucide-react";
import type { AppState, Order } from "../../domain/types";
import { money, shortDate } from "../../shared/format";
import { Modal } from "../../shared/ui";

export function InvoiceModal({ order, settings, onClose }: {
  order: Order;
  settings: AppState["settings"];
  onClose: () => void;
}) {
  const printInvoice = () => {
    document.body.classList.add("print-receipt");
    window.print();
    window.setTimeout(() => document.body.classList.remove("print-receipt"), 500);
  };

  return (
    <Modal title={`فاتورة #${order.number}`} onClose={onClose}>
      <div className="receipt-paper">
        <header>
          {settings.logoDataUrl ? <img className="receipt-logo" src={settings.logoDataUrl} alt="" /> : <CookingPot />}
          <h2>{settings.restaurantName}</h2>
          <p>{settings.subtitle}</p>
          {settings.phone && <small>{settings.phone}</small>}
          {settings.address && <small>{settings.address}</small>}
        </header>
        <div className="receipt-meta">
          <span>رقم الطلب <b>#{order.number}</b></span>
          <span>التاريخ <b>{shortDate(order.createdAt)}</b></span>
          {order.scheduledFor && <span>موعد التوصيل <b>{shortDate(order.scheduledFor)}</b></span>}
        </div>
        <div className="receipt-customer">
          <strong className="receipt-customer-line">
            {order.customerName}
            <span dir="ltr">{order.customerPhone}</span>
          </strong>
          <p>{order.address}</p>
        </div>
        <table>
          <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th></tr></thead>
          <tbody>{order.items.map((item) => (
            <tr key={`${item.productId}:${item.optionId ?? "base"}`}>
              <td>{item.name}</td>
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
      </div>
      <button className="primary-button print-receipt-button" onClick={printInvoice}><Printer /> طباعة الفاتورة</button>
    </Modal>
  );
}
