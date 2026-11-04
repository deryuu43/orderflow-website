import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Search,
  Download,
  Plus,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Eye,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  PageHeader,
  Button,
  StatusIndicator,
  SegmentedTabs,
  Modal,
  EmptyState,
  ErrorBanner,
  TableSkeleton,
} from '../components/ui/DesignSystem.tsx';
import {
  formatRupiah,
  formatDateId,
  formatDateTimeId,
  PAYMENT_STATUS_LABELS,
} from '../lib/formatters.ts';
import { downloadInvoicePdf, type InvoicePdfPayload } from '../lib/pdfInvoice.ts';
import { readAndCompressImageFile } from '../lib/fileUpload.ts';
import { toast } from 'sonner';

interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  grandTotal: number;
  verifiedPaidAmount: number;
  refundedAmount: number;
  remainingAmount: number;
  status: string;
  pendingVerificationCount: number;
  order: {
    id: string;
    orderNumber: string;
    title: string;
  };
  customer: {
    id: string;
    name: string;
    company?: string;
  };
}

export function InvoicesListPage() {
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCustomer = profile?.effectiveRole === 'customer';

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status: statusFilter });
      if (search.trim()) qs.set('search', search.trim());
      const res = await apiFetch<InvoiceListItem[]>(`/api/invoices?${qs.toString()}`);
      setInvoices(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar invoice.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, statusFilter, search]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isCustomer ? 'Tagihan & Pembayaran Saya' : 'Manajemen Invoice & Pembayaran'}
        description="Pantau tagihan DP, pembayaran bertahap, verifikasi bukti transfer, dan unduh PDF invoice."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SegmentedTabs
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'Semua' },
            { value: 'unpaid', label: 'Belum Dibayar' },
            { value: 'partial', label: 'DP / Sebagian' },
            { value: 'paid', label: 'Lunas' },
            { value: 'refunded', label: 'Refund' },
          ]}
        />

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor invoice atau pelanggan..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-200 rounded-lg"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadInvoices} />
      ) : invoices.length === 0 ? (
        <EmptyState
          title="Belum Ada Data Invoice"
          description="Invoice otomatis dibuat saat pesanan baru diterbitkan."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">No. Invoice</th>
                  <th className="py-2.5 px-4">Pesanan & Pelanggan</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Jatuh Tempo</th>
                  <th className="py-2.5 px-4 text-right">Terverifikasi</th>
                  <th className="py-2.5 px-4 text-right">Sisa Tagihan</th>
                  <th className="py-2.5 px-4 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-indigo-600 whitespace-nowrap">
                      <div>{inv.invoiceNumber}</div>
                      {inv.pendingVerificationCount > 0 && (
                        <div className="text-[11px] font-sans text-amber-700">
                          {inv.pendingVerificationCount} menunggu verifikasi
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 truncate max-w-[220px]">
                        {inv.order.title}
                      </div>
                      <div className="text-slate-500">
                        {inv.customer.name} · <span className="font-mono">{inv.order.orderNumber}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator
                        status={inv.status}
                        label={PAYMENT_STATUS_LABELS[inv.status] || inv.status}
                      />
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDateId(inv.dueDate)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium whitespace-nowrap">
                      {formatRupiah(inv.verifiedPaidAmount - inv.refundedAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatRupiah(inv.remainingAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatRupiah(inv.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface InvoiceDetailData extends InvoicePdfPayload {
  invoice: InvoicePdfPayload['invoice'] & { id: string; netVerifiedAmount: number };
  order: InvoicePdfPayload['order'] & { id: string };
  payments: Array<{
    id: string;
    paymentNumber: string;
    paymentType: string;
    method: string;
    amount: number;
    proofUrl: string;
    referenceCode: string;
    verificationStatus: string;
    notes: string;
    paidAt: string;
    submittedByName: string;
    verifiedByName: string | null;
    verifiedAt: string | null;
  }>;
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<InvoiceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment Modal
  const [payOpen, setPayOpen] = useState(false);
  const [payType, setPayType] = useState<'dp' | 'partial' | 'pelunasan' | 'refund'>('dp');
  const [payMethod, setPayMethod] = useState<'transfer_bank' | 'qris' | 'tunai' | 'virtual_account'>(
    'transfer_bank'
  );
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payRef, setPayRef] = useState('');
  const [payProof, setPayProof] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [autoVerify, setAutoVerify] = useState(true);
  const [submittingPay, setSubmittingPay] = useState(false);

  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);

  const canVerify =
    profile?.effectiveRole === 'owner' || profile?.effectiveRole === 'admin';
  const isCustomer = profile?.effectiveRole === 'customer';

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<InvoiceDetailData>(`/api/invoices/${id}`);
      setData(res);
      setPayAmount(res.invoice.remainingAmount > 0 ? res.invoice.remainingAmount : 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail invoice.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleProofPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl } = await readAndCompressImageFile(file);
      setPayProof(dataUrl);
      toast.success('Bukti pembayaran siap dikirim.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'File tidak valid.');
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || payAmount <= 0) {
      toast.error('Masukkan nominal pembayaran yang valid.');
      return;
    }
    setSubmittingPay(true);
    try {
      await apiFetch(`/api/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          paymentType: payType,
          method: payMethod,
          amount: payAmount,
          proofUrl: payProof,
          referenceCode: payRef,
          notes: payNotes,
          autoVerify: canVerify ? autoVerify : false,
        }),
      });
      toast.success(
        canVerify && autoVerify
          ? 'Pembayaran berhasil dicatat dan langsung terverifikasi.'
          : 'Bukti pembayaran berhasil dikirim dan menunggu verifikasi Admin.'
      );
      setPayOpen(false);
      setPayProof('');
      setPayRef('');
      setPayNotes('');
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pembayaran.');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleVerifyDecision = async (paymentId: string, decision: 'verified' | 'rejected') => {
    try {
      await apiFetch(`/api/payments/${paymentId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      toast.success(
        decision === 'verified'
          ? 'Pembayaran berhasil diverifikasi.'
          : 'Pembayaran ditolak.'
      );
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses verifikasi.');
    }
  };

  if (loading) return <TableSkeleton rows={6} />;
  if (error || !data) {
    return <ErrorBanner message={error || 'Invoice tidak ditemukan.'} onRetry={loadDetail} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice ${data.invoice.invoiceNumber}`}
        description={`Pesanan ${data.order.orderNumber} · ${data.customer.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(isCustomer ? '/portal/invoices' : '/invoices')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                downloadInvoicePdf(data);
                toast.success('File PDF Invoice berhasil diunduh.');
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh PDF</span>
            </Button>
            <Button type="button" size="sm" onClick={() => setPayOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              <span>{isCustomer ? 'Unggah Bukti Bayar' : 'Catat Pembayaran'}</span>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Commercial Invoice Sheet */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200/80">
            <div>
              <div className="text-base font-bold text-slate-900">
                {data.business?.name || 'OrderFlow Workspace'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{data.business?.address}</div>
            </div>
            <div className="sm:text-right">
              <StatusIndicator
                status={data.invoice.status}
                label={PAYMENT_STATUS_LABELS[data.invoice.status] || data.invoice.status}
              />
              <div className="text-xs text-slate-500 font-mono mt-1">
                Jatuh Tempo: {formatDateId(data.invoice.dueDate)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-400 font-medium">DITAGIHKAN KEPADA</div>
              <div className="font-semibold text-slate-900 mt-1">{data.customer.name}</div>
              {data.customer.company && <div className="text-slate-600">{data.customer.company}</div>}
              <div className="font-mono text-slate-600 mt-0.5">{data.customer.phone}</div>
            </div>
            <div>
              <div className="text-slate-400 font-medium">REFERENSI PESANAN</div>
              <Link
                to={isCustomer ? `/portal/orders/${data.order.id}` : `/orders/${data.order.id}`}
                className="font-mono font-semibold text-indigo-600 hover:underline mt-1 inline-block"
              >
                {data.order.orderNumber}
              </Link>
              <div className="text-slate-700">{data.order.title}</div>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-slate-200/80 pt-4">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Item Produk</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Harga</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-3 pr-2">
                      <div className="font-medium text-slate-900">{it.productName}</div>
                      {it.specifications && (
                        <div className="text-slate-500">{it.specifications}</div>
                      )}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {it.quantity} {it.unit}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {formatRupiah(it.unitPrice)}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums font-medium">
                      {formatRupiah(it.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatRupiah(data.invoice.subtotal)}</span>
            </div>
            {data.invoice.additionalCost > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Biaya Tambahan</span>
                <span className="font-mono tabular-nums">
                  + {formatRupiah(data.invoice.additionalCost)}
                </span>
              </div>
            )}
            {data.invoice.discount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Diskon</span>
                <span className="font-mono tabular-nums">
                  - {formatRupiah(data.invoice.discount)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums">{formatRupiah(data.invoice.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Pembayaran Terverifikasi (Bersih)</span>
              <span className="font-mono tabular-nums">
                {formatRupiah(data.invoice.netVerifiedAmount)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold text-indigo-600 pt-1">
              <span>Sisa Tagihan</span>
              <span className="font-mono tabular-nums">
                {formatRupiah(data.invoice.remainingAmount)}
              </span>
            </div>
          </div>

          {data.settings?.bankName && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              <strong className="text-slate-900">Rekening Pembayaran:</strong>{' '}
              {data.settings.bankName} · <span className="font-mono">{data.settings.bankAccountNumber}</span>{' '}
              a.n. {data.settings.bankAccountHolder}
            </div>
          )}
        </div>

        {/* Payment Records & Admin Verification */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Riwayat & Verifikasi Pembayaran ({data.payments.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pembayaran yang belum diverifikasi tidak dihitung sebagai pembayaran terkonfirmasi.
            </p>
          </div>

          {data.payments.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Belum ada pembayaran tercatat untuk invoice ini.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.payments.map((p) => (
                <div key={p.id} className="py-4 first:pt-1 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono font-semibold text-slate-900">
                        {p.paymentNumber} · {p.paymentType.toUpperCase()}
                      </div>
                      <div className="text-slate-500">
                        Metode: {p.method.replace(/_/g, ' ')} {p.referenceCode ? `(${p.referenceCode})` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono tabular-nums font-bold text-slate-900">
                        {p.paymentType === 'refund' ? '-' : ''}
                        {formatRupiah(p.amount)}
                      </div>
                      <StatusIndicator
                        status={p.verificationStatus}
                        label={
                          p.verificationStatus === 'verified'
                            ? 'Terverifikasi'
                            : p.verificationStatus === 'rejected'
                            ? 'Ditolak'
                            : 'Menunggu Verifikasi'
                        }
                      />
                    </div>
                  </div>

                  {p.notes && <div className="text-slate-600">{p.notes}</div>}

                  <div className="text-[11px] text-slate-400">
                    Dikirim oleh {p.submittedByName} · {formatDateTimeId(p.paidAt)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {p.proofUrl && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setProofPreviewUrl(p.proofUrl)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat Bukti</span>
                      </Button>
                    )}

                    {canVerify && p.verificationStatus === 'pending' && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleVerifyDecision(p.id, 'verified')}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Verifikasi</span>
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => void handleVerifyDecision(p.id, 'rejected')}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Tolak</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Record / Upload Payment Modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={isCustomer ? 'Unggah Bukti Pembayaran' : 'Catat Pembayaran / Refund'}
      >
        <form onSubmit={handleSubmitPayment} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Jenis Pembayaran</label>
              <select
                value={payType}
                onChange={(e) =>
                  setPayType(e.target.value as 'dp' | 'partial' | 'pelunasan' | 'refund')
                }
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              >
                <option value="dp">Down Payment (DP)</option>
                <option value="partial">Cicilan / Bertahap</option>
                <option value="pelunasan">Pelunasan Akhir</option>
                {canVerify && <option value="refund">Refund Pengembalian Dana</option>}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Metode</label>
              <select
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(
                    e.target.value as 'transfer_bank' | 'qris' | 'tunai' | 'virtual_account'
                  )
                }
                className="w-full h-9 px-3 border border-slate-200 rounded-lg"
              >
                <option value="transfer_bank">Transfer Bank</option>
                <option value="qris">QRIS</option>
                <option value="virtual_account">Virtual Account</option>
                <option value="tunai">Tunai di Workshop</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Nominal (Rp) *</label>
            <input
              type="number"
              min={1}
              required
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
              className="w-full h-9 px-3 font-mono tabular-nums border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Nomor Referensi / Berita Transfer
            </label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="Contoh: BCA-882910"
              className="w-full h-9 px-3 font-mono border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Unggah Foto Bukti Transfer (Opsional untuk Admin, Disarankan untuk Pelanggan)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleProofPick}
              className="w-full text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50"
            />
            {payProof && (
              <img
                src={payProof}
                alt="Preview bukti"
                className="mt-2 h-28 rounded border border-slate-200 object-contain"
              />
            )}
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Catatan</label>
            <textarea
              rows={2}
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg"
            />
          </div>

          {canVerify && payType !== 'refund' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoVerify}
                onChange={(e) => setAutoVerify(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="text-slate-700">
                Langsung tandai pembayaran ini sebagai Terverifikasi
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submittingPay}>
              {submittingPay ? 'Menyimpan...' : 'Simpan Pembayaran'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(proofPreviewUrl)}
        onClose={() => setProofPreviewUrl(null)}
        title="Bukti Pembayaran"
      >
        {proofPreviewUrl && (
          <img
            src={proofPreviewUrl}
            alt="Bukti Transfer"
            className="w-full max-h-[65vh] object-contain rounded-lg"
          />
        )}
      </Modal>
    </div>
  );
}

interface ReportsData {
  period: { range: string; startDate: string; endDate: string };
  summary: {
    totalOrders: number;
    confirmedRevenue: number;
    completedOrders: number;
    overdueOrders: number;
    qcPassRate: number;
    totalQcInspections: number;
  };
  topProducts: Array<{
    productName: string;
    totalQty: number;
    totalRevenue: number;
    orderCount: number;
  }>;
  productionPerformance: Array<{
    stage: string;
    count: number;
  }>;
  paymentHistory: Array<{
    id: string;
    paymentNumber: string;
    invoiceNumber: string;
    orderNumber: string;
    customerName: string;
    paymentType: string;
    method: string;
    amount: number;
    paidAt: string;
  }>;
}

export function ReportsPage() {
  const { apiFetch } = useAuth();

  const [range, setRange] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ range });
      if (range === 'custom' && startDate) qs.set('startDate', startDate);
      if (range === 'custom' && endDate) qs.set('endDate', endDate);
      const res = await apiFetch<ReportsData>(`/api/reports?${qs.toString()}`);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat laporan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, range, startDate, endDate]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleExportCsv = () => {
    if (!data) return;
    const header = ['No Pembayaran', 'Invoice', 'Pesanan', 'Pelanggan', 'Tipe', 'Metode', 'Nominal', 'Tanggal'];
    const rows = data.paymentHistory.map((p) => [
      p.paymentNumber,
      p.invoiceNumber,
      p.orderNumber,
      `"${p.customerName.replace(/"/g, '""')}"`,
      p.paymentType,
      p.method,
      String(p.amount),
      formatDateTimeId(p.paidAt),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan-OrderFlow-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan CSV berhasil diunduh.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan & Analitik Bisnis"
        description="Analisis pendapatan terkonfirmasi, produk terlaris, performa produksi, dan riwayat kas."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={handleExportCsv}>
            <Download className="w-3.5 h-3.5" />
            <span>Unduh CSV Pembayaran</span>
          </Button>
        }
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <SegmentedTabs
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: 'Hari Ini' },
            { value: 'week', label: 'Minggu Ini' },
            { value: 'month', label: 'Bulan Ini' },
            { value: 'year', label: 'Tahun Ini' },
            { value: 'custom', label: 'Rentang Tanggal' },
          ]}
        />

        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <span className="text-xs text-slate-400">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : error || !data ? (
        <ErrorBanner message={error || 'Data laporan gagal dimuat.'} onRetry={loadReports} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Total Pesanan Periode</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {data.summary.totalOrders}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Pendapatan Terkonfirmasi</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {formatRupiah(data.summary.confirmedRevenue)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Pesanan Selesai</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-indigo-600">
                {data.summary.completedOrders}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Pesanan Terlambat</div>
              <div
                className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                  data.summary.overdueOrders > 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {data.summary.overdueOrders}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">
                Produk Paling Banyak Dipesan
              </h2>
              <p className="text-xs text-slate-500 mb-4">Berdasarkan total kuantitas unit</p>
              {data.topProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Belum ada item produk dipesan pada rentang waktu ini.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topProducts}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        type="category"
                        dataKey="productName"
                        width={140}
                        tick={{ fontSize: 11, fill: '#334155' }}
                      />
                      <Tooltip
                        formatter={(val) => [`${Number(val ?? 0)} unit`, 'Kuantitas']}
                        contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Bar dataKey="totalQty" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Performa Produksi & QC</h2>
                  <p className="text-xs text-slate-500">Distribusi pengerjaan pada periode terpilih</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Rasio Lolos QC</div>
                  <div className="text-sm font-mono font-bold text-emerald-700">
                    {data.summary.qcPassRate}%
                  </div>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.productionPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      formatter={(val) => [`${Number(val ?? 0)} pesanan`, 'Jumlah']}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Verified Payment History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80">
              <h2 className="text-sm font-semibold text-slate-900">
                Riwayat Pembayaran Terverifikasi
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">No. Pembayaran</th>
                    <th className="py-2.5 px-4">Invoice & Pesanan</th>
                    <th className="py-2.5 px-4">Pelanggan</th>
                    <th className="py-2.5 px-4">Tipe & Metode</th>
                    <th className="py-2.5 px-4">Tanggal</th>
                    <th className="py-2.5 px-4 text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.paymentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Belum ada transaksi pembayaran terverifikasi pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    data.paymentHistory.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          {p.paymentNumber}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {p.invoiceNumber} · {p.orderNumber}
                        </td>
                        <td className="py-3 px-4 text-slate-900">{p.customerName}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {p.paymentType.toUpperCase()} · {p.method.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                          {formatDateTimeId(p.paidAt)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            p.paymentType === 'refund' ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {p.paymentType === 'refund' ? '-' : '+'}
                          {formatRupiah(p.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
