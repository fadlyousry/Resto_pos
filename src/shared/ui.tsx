import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  children,
  onClose,
  size = "default"
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "default" | "medium" | "wide";
}) {
  const sizeClass = size === "default" ? "modal" : `modal ${size}`;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={sizeClass}>
        <header><h2>{title}</h2><button onClick={onClose}><X /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function MiniStat({ icon, label, value, tone }: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return <div className={`mini-stat ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

export function StatusBadge({ children, type }: {
  children: ReactNode;
  type: "success" | "warning" | "info" | "neutral";
}) {
  return <span className={`status-badge ${type}`}>{children}</span>;
}

export function Empty({ icon, title, text }: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return <div className="empty-state wide">{icon}<strong>{title}</strong><span>{text}</span></div>;
}
