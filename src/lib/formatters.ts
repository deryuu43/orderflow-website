export function formatRupiah(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDateId(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeId(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  menunggu_konfirmasi: 'Menunggu Konfirmasi',
  dikonfirmasi: 'Dikonfirmasi',
  diproses: 'Dalam Proses',
  siap_dikirim: 'Siap Dikirim',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

export const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  menunggu_produksi: 'Menunggu Produksi',
  persiapan: 'Persiapan',
  dalam_produksi: 'Dalam Produksi',
  quality_control: 'Quality Control',
  siap_dikirim: 'Siap Dikirim',
  selesai: 'Selesai',
};

export const DESIGN_STATUS_LABELS: Record<string, string> = {
  menunggu_desain: 'Menunggu Desain',
  menunggu_persetujuan: 'Menunggu Persetujuan',
  revisi: 'Revisi',
  disetujui: 'Disetujui',
  tidak_perlu: 'Tanpa Desain',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Belum Dibayar',
  partial: 'Dibayar Sebagian (DP)',
  paid: 'Lunas',
  refunded: 'Refund Penuh',
  partially_refunded: 'Refund Sebagian',
};

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner Bisnis',
  admin: 'Admin Operasional',
  production_staff: 'Staf Produksi',
  customer: 'Pelanggan (Portal)',
};
