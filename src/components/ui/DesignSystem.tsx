import React, { useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ArrowRight,
  X,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function getToneForStatus(status: string): SemanticTone {
  switch (status) {
    case 'selesai':
    case 'paid':
    case 'verified':
    case 'disetujui':
    case 'diterima':
    case 'active':
      return 'success';
    case 'terlambat':
    case 'dibatalkan':
    case 'rejected':
    case 'expired':
    case 'cancelled':
      return 'danger';
    case 'revisi':
    case 'partial':
    case 'pending':
    case 'menunggu_persetujuan':
    case 'quality_control':
    case 'past_due':
    case 'partially_refunded':
      return 'warning';
    case 'dalam_produksi':
    case 'persiapan':
    case 'siap_dikirim':
    case 'diproses':
    case 'dikonfirmasi':
    case 'dikirim':
      return 'info';
    default:
      return 'neutral';
  }
}

// Clean unboxed semantic status indicator (Zero-Pill Discipline + Accessible Icon + Text)
export function StatusIndicator({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  const tone = getToneForStatus(status);

  const toneConfig: Record<
    SemanticTone,
    { text: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    success: { text: 'text-emerald-700', Icon: CheckCircle2 },
    danger: { text: 'text-red-700', Icon: XCircle },
    warning: { text: 'text-amber-700', Icon: AlertTriangle },
    info: { text: 'text-indigo-700', Icon: ArrowRight },
    neutral: { text: 'text-slate-600', Icon: Clock },
  };

  const { text, Icon } = toneConfig[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0',
        text,
        className
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

// Functional interactive segmented filter buttons
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/80 overflow-x-auto max-w-full">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600',
              active
                ? 'bg-white text-slate-900 border border-slate-200/90'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className="ml-1.5 font-mono tabular-nums text-[11px] text-slate-400">
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200/80">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const variants = {
    primary:
      'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600 disabled:opacity-50',
    secondary:
      'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600 disabled:opacity-50',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs min-h-[34px]',
    md: 'px-4 py-2 text-sm min-h-[40px]',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]">
      <div
        className={cn(
          'w-full bg-white border border-slate-200 rounded-xl overflow-hidden max-h-[90vh] flex flex-col',
          maxWidth
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200/80">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Konfirmasi',
  variant = 'danger',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
      <div className="mt-6 flex items-center justify-end gap-2.5">
        <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
          Batal
        </Button>
        <Button type="button" variant={variant} onClick={onConfirm} disabled={loading}>
          {loading ? 'Memproses...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-6 py-12 text-center">
      <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
        <Inbox className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">{description}</p>
      {action && <div className="mt-5 flex items-center justify-center gap-3">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-red-50/70 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-2.5 text-sm text-red-800">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" />
          Coba Lagi
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="h-10 bg-slate-50 border-b border-slate-200" />
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 px-5 flex items-center justify-between gap-4 animate-pulse">
            <div className="h-3.5 w-32 bg-slate-200 rounded" />
            <div className="h-3.5 w-48 bg-slate-100 rounded hidden sm:block" />
            <div className="h-3.5 w-24 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
