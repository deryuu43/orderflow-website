import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  Plus,
  Search,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Copy,
  Upload,
  Eye,
  Truck,
  Edit3,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  PageHeader,
  Button,
  StatusIndicator,
  SegmentedTabs,
  Modal,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  TableSkeleton,
} from '../components/ui/DesignSystem.tsx';
import {
  formatRupiah,
  formatDateId,
  formatDateTimeId,
  ORDER_STATUS_LABELS,
  PRODUCTION_STATUS_LABELS,
  DESIGN_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../lib/formatters.ts';
import { readAndCompressImageFile } from '../lib/fileUpload.ts';
import { toast } from 'sonner';

interface OrderRow {
  id: string;
  orderNumber: string;
  trackingToken: string;
  title: string;
  category: string;
  orderStatus: string;
  designStatus: string;
  productionStatus: string;
  paymentStatus: string;
  grandTotal: number;
  paidAmount: number;
  orderDate: string;
  deadline: string;
  isOverdue: boolean;
  customer: {
    id: string;
    name: string;
    company?: string;
    phone: string;
  };
}

interface PaginatedOrders {
  data: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function OrdersListPage() {
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<PaginatedOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canCreate =
    profile?.effectiveRole === 'owner' || profile?.effectiveRole === 'admin';

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '10',
        status: statusFilter,
      });
      if (search.trim()) qs.set('search', search.trim());
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);

      const res = await apiFetch<PaginatedOrders>(`/api/orders?${qs.toString()}`);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pesanan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, statusFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Pesanan"
        description="Kelola seluruh pesanan masuk, spesifikasi custom, tenggat waktu, dan progres lintas divisi."
        actions={
          canCreate ? (
            <Button type="button" onClick={() => navigate('/orders/create')}>
              <Plus className="w-4 h-4" />
              <span>Tambah Pesanan</span>
            </Button>
          ) : undefined
        }
      />

      {/* Filter & Search Toolbar */}
      <div className="space-y-3">
        <SegmentedTabs
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'Semua Status' },
            { value: 'menunggu_konfirmasi', label: 'Menunggu Konfirmasi' },
            { value: 'dikonfirmasi', label: 'Dikonfirmasi' },
            { value: 'diproses', label: 'Dalam Proses' },
            { value: 'siap_dikirim', label: 'Siap Dikirim' },
            { value: 'selesai', label: 'Selesai' },
            { value: 'dibatalkan', label: 'Dibatalkan' },
          ]}
        />

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari nomor pesanan, produk, nama pelanggan, atau token tracking..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Dari tanggal"
              className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
            />
            <span className="text-xs text-slate-400">s/d</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="Sampai tanggal"
              className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
            />
            {(search || dateFrom || dateTo || statusFilter !== 'all') && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                  setStatusFilter('all');
                  setPage(1);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadOrders} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          title="Belum Ada Pesanan Ditemukan"
          description="Tambahkan pesanan baru beserta spesifikasi item produk untuk memulai alur desain, produksi, dan tagihan invoice."
          action={
            canCreate ? (
              <Button type="button" onClick={() => navigate('/orders/create')}>
                <Plus className="w-4 h-4" />
                <span>Buat Pesanan Baru</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">No. Pesanan</th>
                  <th className="py-2.5 px-4">Pelanggan & Pekerjaan</th>
                  <th className="py-2.5 px-4">Status Pesanan</th>
                  <th className="py-2.5 px-4">Desain · Produksi</th>
                  <th className="py-2.5 px-4">Pembayaran</th>
                  <th className="py-2.5 px-4">Deadline</th>
                  <th className="py-2.5 px-4 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {result.data.map((ord) => (
                  <tr
                    key={ord.id}
                    onClick={() => navigate(`/orders/${ord.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono tabular-nums font-medium text-indigo-600 whitespace-nowrap">
                      {ord.orderNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 truncate max-w-[230px]">
                        {ord.title}
                      </div>
                      <div className="text-slate-500 truncate max-w-[230px]">
                        {ord.customer.name} · {ord.category}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator
                        status={ord.isOverdue ? 'terlambat' : ord.orderStatus}
                        label={
                          ord.isOverdue
                            ? 'Terlambat'
                            : ORDER_STATUS_LABELS[ord.orderStatus] || ord.orderStatus
                        }
                      />
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      <span>{DESIGN_STATUS_LABELS[ord.designStatus] || ord.designStatus}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>
                        {PRODUCTION_STATUS_LABELS[ord.productionStatus] || ord.productionStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator
                        status={ord.paymentStatus}
                        label={PAYMENT_STATUS_LABELS[ord.paymentStatus] || ord.paymentStatus}
                      />
                    </td>
                    <td
                      className={`py-3 px-4 font-mono tabular-nums whitespace-nowrap ${
                        ord.isOverdue ? 'text-red-600 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      {formatDateId(ord.deadline)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatRupiah(ord.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-4 py-3 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <span>
              Total <strong className="font-mono text-slate-800">{result.total}</strong> pesanan ·
              Halaman <strong className="font-mono text-slate-800">{result.page}</strong> dari{' '}
              <strong className="font-mono text-slate-800">{result.totalPages}</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page >= result.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface OrderFormValues {
  customerId: string;
  title: string;
  category: string;
  description: string;
  specifications: string;
  items: Array<{
    productName: string;
    description: string;
    specifications: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }>;
  additionalCost: number;
  discount: number;
  requiresDesignApproval: boolean;
  minDpPercent: number;
  orderDate: string;
  deadline: string;
  notes: string;
}

export function OrderFormPage({ editOrderId }: { editOrderId?: string }) {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();

  const [customersList, setCustomersList] = useState<
    Array<{ id: string; name: string; company?: string; phone: string }>
  >([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Quick Add Customer Modal
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustCompany, setNewCustCompany] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OrderFormValues>({
    defaultValues: {
      customerId: '',
      title: '',
      category: 'Konveksi',
      description: '',
      specifications: '',
      items: [
        {
          productName: '',
          description: '',
          specifications: '',
          quantity: 12,
          unit: 'pcs',
          unitPrice: 75000,
        },
      ],
      additionalCost: 0,
      discount: 0,
      requiresDesignApproval: true,
      minDpPercent: 50,
      orderDate: todayStr,
      deadline: defaultDeadline,
      notes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedItems = watch('items');
  const watchedAdditional = Number(watch('additionalCost') || 0);
  const watchedDiscount = Number(watch('discount') || 0);
  const watchedMinDp = Number(watch('minDpPercent') || 0);

  // Exact Master Prompt Formula:
  // Subtotal = Total seluruh (Quantity × Unit Price)
  // Grand Total = Subtotal + Additional Cost - Discount
  const subtotal = (watchedItems || []).reduce((sum, item) => {
    const q = Math.max(0, Number(item.quantity || 0));
    const p = Math.max(0, Number(item.unitPrice || 0));
    return sum + q * p;
  }, 0);

  const grandTotal = Math.max(
    0,
    subtotal + Math.max(0, watchedAdditional) - Math.max(0, watchedDiscount)
  );
  const minDpNominal = Math.ceil(grandTotal * (watchedMinDp / 100));

  useEffect(() => {
    const init = async () => {
      setLoadingInit(true);
      try {
        const custs = await apiFetch<
          Array<{ id: string; name: string; company?: string; phone: string }>
        >('/api/customers');
        setCustomersList(custs);

        if (editOrderId) {
          const detail = await apiFetch<{
            order: {
              customerId: string;
              title: string;
              category: string;
              description: string;
              specifications: string;
              additionalCost: number;
              discount: number;
              requiresDesignApproval: boolean;
              minDpPercent: number;
              orderDate: string;
              deadline: string;
              notes: string;
            };
            items: Array<{
              productName: string;
              description: string;
              specifications: string;
              quantity: number;
              unit: string;
              unitPrice: number;
            }>;
          }>(`/api/orders/${editOrderId}`);

          reset({
            customerId: detail.order.customerId,
            title: detail.order.title,
            category: detail.order.category,
            description: detail.order.description || '',
            specifications: detail.order.specifications || '',
            items: detail.items.map((it) => ({
              productName: it.productName,
              description: it.description || '',
              specifications: it.specifications || '',
              quantity: it.quantity,
              unit: it.unit || 'pcs',
              unitPrice: it.unitPrice,
            })),
            additionalCost: detail.order.additionalCost,
            discount: detail.order.discount,
            requiresDesignApproval: detail.order.requiresDesignApproval,
            minDpPercent: detail.order.minDpPercent,
            orderDate: new Date(detail.order.orderDate).toISOString().slice(0, 10),
            deadline: new Date(detail.order.deadline).toISOString().slice(0, 10),
            notes: detail.order.notes || '',
          });
        } else if (custs[0]) {
          setValue('customerId', custs[0].id);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Gagal memuat data awal form.');
      } finally {
        setLoadingInit(false);
      }
    };
    void init();
  }, [apiFetch, editOrderId, reset, setValue]);

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      toast.error('Nama dan nomor telepon pelanggan wajib diisi.');
      return;
    }
    try {
      const created = await apiFetch<{ id: string; name: string; company?: string; phone: string }>(
        '/api/customers',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newCustName,
            company: newCustCompany,
            phone: newCustPhone,
            email: newCustEmail,
            address: newCustAddress,
          }),
        }
      );
      setCustomersList((prev) => [created, ...prev]);
      setValue('customerId', created.id);
      setQuickCustOpen(false);
      setNewCustName('');
      setNewCustCompany('');
      setNewCustPhone('');
      setNewCustEmail('');
      setNewCustAddress('');
      toast.success(`Pelanggan ${created.name} berhasil ditambahkan.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menambah pelanggan.');
    }
  };

  const onSubmit = async (values: OrderFormValues) => {
    if (!values.customerId) {
      toast.error('Pilih pelanggan terlebih dahulu atau tambahkan pelanggan baru.');
      return;
    }
    setSubmitting(true);
    try {
      if (editOrderId) {
        await apiFetch(`/api/orders/${editOrderId}`, {
          method: 'PUT',
          body: JSON.stringify(values),
        });
        toast.success('Pesanan berhasil diperbarui.');
        navigate(`/orders/${editOrderId}`);
      } else {
        const created = await apiFetch<{ id: string; orderNumber: string }>('/api/orders', {
          method: 'POST',
          body: JSON.stringify(values),
        });
        toast.success(`Pesanan ${created.orderNumber} berhasil dibuat.`);
        navigate(`/orders/${created.id}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pesanan.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInit) {
    return <TableSkeleton rows={6} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={editOrderId ? 'Edit Pesanan' : 'Buat Pesanan Baru'}
        description="Nomor pesanan, antrean produksi Kanban, dan draf invoice akan dibuat secara otomatis."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(editOrderId ? `/orders/${editOrderId}` : '/orders')}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Customer & Order Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">1. Pelanggan & Informasi Pesanan</h2>
              <span className="text-xs font-mono text-slate-400">Nomor Pesanan: Otomatis</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-8">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Pelanggan *
                </label>
                <select
                  {...register('customerId', { required: 'Pelanggan wajib dipilih' })}
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">-- Pilih Pelanggan --</option>
                  {customersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ''} — {c.phone}
                    </option>
                  ))}
                </select>
                {errors.customerId && (
                  <p className="mt-1 text-xs text-red-600">{errors.customerId.message}</p>
                )}
              </div>
              <div className="sm:col-span-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setQuickCustOpen(true)}
                  className="w-full"
                >
                  <Plus className="w-4 h-4" />
                  <span>Pelanggan Baru</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-8">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Judul / Nama Pekerjaan Pesanan *
                </label>
                <input
                  type="text"
                  {...register('title', { required: 'Judul pesanan wajib diisi', minLength: 3 })}
                  placeholder="Contoh: Produksi Kaos Event 150 Pcs + Sablon Plastisol"
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                {errors.title && (
                  <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
                )}
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Kategori Bisnis
                </label>
                <select
                  {...register('category')}
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="Konveksi">Konveksi</option>
                  <option value="Percetakan">Percetakan</option>
                  <option value="Sablon">Sablon</option>
                  <option value="Merchandise">Merchandise</option>
                  <option value="Souvenir">Souvenir</option>
                  <option value="Furniture Custom">Furniture Custom</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Deskripsi Umum
                </label>
                <textarea
                  rows={2}
                  {...register('description')}
                  placeholder="Ringkasan kebutuhan pesanan..."
                  className="w-full p-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Spesifikasi Teknis Produksi
                </label>
                <textarea
                  rows={2}
                  {...register('specifications')}
                  placeholder="Bahan, gramasi, warna CMYK/Pantone, ukuran cetak, finishing..."
                  className="w-full p-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Multi-Item Product Builder */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  2. Daftar Item Produk
                </h2>
                <p className="text-xs text-slate-500">
                  Mendukung beberapa item produk dalam satu pesanan.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  append({
                    productName: '',
                    description: '',
                    specifications: '',
                    quantity: 1,
                    unit: 'pcs',
                    unitPrice: 0,
                  })
                }
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris Item</span>
              </Button>
            </div>

            <div className="divide-y divide-slate-200/80">
              {fields.map((field, index) => {
                const rowQty = Number(watchedItems?.[index]?.quantity || 0);
                const rowPrice = Number(watchedItems?.[index]?.unitPrice || 0);
                const rowTotal = Math.max(0, rowQty * rowPrice);

                return (
                  <div key={field.id} className="py-4 first:pt-1 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Nama Produk #{index + 1} *
                        </label>
                        <input
                          type="text"
                          {...register(`items.${index}.productName`, { required: true })}
                          placeholder="Nama item produk"
                          className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Jumlah *
                        </label>
                        <input
                          type="number"
                          min={1}
                          {...register(`items.${index}.quantity`, { valueAsNumber: true, min: 1 })}
                          className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Satuan
                        </label>
                        <input
                          type="text"
                          {...register(`items.${index}.unit`)}
                          placeholder="pcs / set"
                          className="w-full h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Harga Satuan (Rp) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          {...register(`items.${index}.unitPrice`, { valueAsNumber: true, min: 0 })}
                          className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <input
                        type="text"
                        {...register(`items.${index}.specifications`)}
                        placeholder="Spesifikasi khusus item ini (ukuran S/M/L, bahan, warna)..."
                        className="flex-1 h-8 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <div className="flex items-center justify-end gap-3 shrink-0">
                        <span className="text-xs font-mono tabular-nums font-semibold text-slate-800">
                          Subtotal Item: {formatRupiah(rowTotal)}
                        </span>
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                            title="Hapus item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Schedule, Rules & Live Price Summary */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">3. Jadwal & Syarat Produksi</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Pesanan
                </label>
                <input
                  type="date"
                  {...register('orderDate')}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Deadline Selesai *
                </label>
                <input
                  type="date"
                  {...register('deadline', { required: true })}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Minimal DP Sebelum Produksi (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                {...register('minDpPercent', { valueAsNumber: true })}
                className="w-full h-9 px-3 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                {...register('requiresDesignApproval')}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span className="text-xs text-slate-700 leading-snug">
                Wajib persetujuan desain pelanggan sebelum produksi dimulai
              </span>
            </label>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan Pesanan
              </label>
              <textarea
                rows={2}
                {...register('notes')}
                placeholder="Catatan tambahan pengemasan / pengiriman..."
                className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">4. Kalkulasi Harga</h2>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Biaya Tambahan (Setting / Ongkir / Bordir Ekstra)
              </label>
              <input
                type="number"
                min={0}
                {...register('additionalCost', { valueAsNumber: true })}
                className="w-full h-9 px-3 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Diskon Potongan Harga (Rp)
              </label>
              <input
                type="number"
                min={0}
                {...register('discount', { valueAsNumber: true })}
                className="w-full h-9 px-3 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal Item</span>
                <span className="font-mono tabular-nums">{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Biaya Tambahan</span>
                <span className="font-mono tabular-nums">
                  + {formatRupiah(Math.max(0, watchedAdditional))}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Diskon</span>
                <span className="font-mono tabular-nums">
                  - {formatRupiah(Math.max(0, watchedDiscount))}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                <span>Grand Total</span>
                <span className="font-mono tabular-nums text-indigo-600">
                  {formatRupiah(grandTotal)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Syarat Minimal DP ({watchedMinDp}%)</span>
                <span className="font-mono tabular-nums">{formatRupiah(minDpNominal)}</span>
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting
                ? 'Menyimpan Pesanan...'
                : editOrderId
                ? 'Simpan Perubahan Pesanan'
                : 'Simpan & Terbitkan Pesanan'}
            </Button>
          </div>
        </div>
      </form>

      {/* Quick Create Customer Modal */}
      <Modal
        open={quickCustOpen}
        onClose={() => setQuickCustOpen(false)}
        title="Tambah Pelanggan Baru"
        description="Pelanggan baru akan langsung terpilih pada formulir pesanan ini."
      >
        <form onSubmit={handleQuickCreateCustomer} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Lengkap *
            </label>
            <input
              type="text"
              required
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Perusahaan / Instansi
              </label>
              <input
                type="text"
                value={newCustCompany}
                onChange={(e) => setNewCustCompany(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                No. Telepon / WhatsApp *
              </label>
              <input
                type="text"
                required
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="0812..."
                className="w-full h-9 px-3 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={newCustEmail}
              onChange={(e) => setNewCustEmail(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat</label>
            <textarea
              rows={2}
              value={newCustAddress}
              onChange={(e) => setNewCustAddress(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setQuickCustOpen(false)}>
              Batal
            </Button>
            <Button type="submit">Simpan Pelanggan</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function OrderEditWrapperPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderFormPage editOrderId={id} />;
}

interface OrderFullDetail {
  order: {
    id: string;
    orderNumber: string;
    trackingToken: string;
    trackingPin: string;
    title: string;
    category: string;
    description: string;
    specifications: string;
    orderStatus: string;
    designStatus: string;
    productionStatus: string;
    paymentStatus: string;
    requiresDesignApproval: boolean;
    minDpPercent: number;
    subtotal: number;
    additionalCost: number;
    discount: number;
    grandTotal: number;
    paidAmount: number;
    refundedAmount: number;
    orderDate: string;
    deadline: string;
    notes: string;
    cancelReason: string | null;
    isOverdue: boolean;
  };
  customer: {
    id: string;
    name: string;
    company?: string;
    phone: string;
    email?: string;
    address?: string;
  };
  items: Array<{
    id: string;
    productName: string;
    specifications: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
  }>;
  designFiles: Array<{
    id: string;
    version: number;
    fileType: 'design_proof' | 'customer_reference';
    title: string;
    fileName: string;
    fileUrl: string;
    notes: string;
    approvalStatus: string;
    isProductionReference: boolean;
    uploadedByName: string;
    uploadedByRole: string;
    approvedAt: string | null;
    approvedByName: string | null;
    createdAt: string;
  }>;
  designRevisions: Array<{
    id: string;
    revisionNumber: number;
    revisionNotes: string;
    status: string;
    requestedByName: string;
    createdAt: string;
  }>;
  productionJob: {
    id: string;
    jobNumber: string;
    status: string;
    qcPassed: boolean;
    assignedStaffName: string | null;
  } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    verifiedPaidAmount: number;
    grandTotal: number;
  } | null;
  shipping: {
    courierName: string;
    serviceType: string;
    trackingNumber: string;
    recipientName: string;
    recipientPhone: string;
    shippingAddress: string;
    shippingCost: number;
    status: string;
  } | null;
  statusHistory: Array<{
    id: string;
    domain: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string;
    actorName: string;
    createdAt: string;
  }>;
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<OrderFullDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'items' | 'design' | 'shipping' | 'history'>('items');

  // Modals
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Design Upload Form
  const [uploadOpen, setUploadOpen] = useState(false);
  const [designTitle, setDesignTitle] = useState('');
  const [designNotes, setDesignNotes] = useState('');
  const [designFileUrl, setDesignFileUrl] = useState('');
  const [designFileName, setDesignFileName] = useState('');
  const [designType, setDesignType] = useState<'design_proof' | 'customer_reference'>('design_proof');
  const [submittingDesign, setSubmittingDesign] = useState(false);

  // Revision Request Form
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionTargetId, setRevisionTargetId] = useState<string | undefined>(undefined);
  const [revisionNotes, setRevisionNotes] = useState('');

  // Shipping Form
  const [shipOpen, setShipOpen] = useState(false);
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shipStatus, setShipStatus] = useState<'belum_dikirim' | 'dikemas' | 'dikirim' | 'diterima'>(
    'belum_dikirim'
  );
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');

  const isCustomer = profile?.effectiveRole === 'customer';
  const canManage =
    profile?.effectiveRole === 'owner' || profile?.effectiveRole === 'admin';

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<OrderFullDetail>(`/api/orders/${id}`);
      setDetail(res);
      if (res.shipping) {
        setCourierName(res.shipping.courierName);
        setTrackingNumber(res.shipping.trackingNumber || '');
        setShipStatus(
          res.shipping.status as 'belum_dikirim' | 'dikemas' | 'dikirim' | 'diterima'
        );
        setRecipientName(res.shipping.recipientName);
        setRecipientPhone(res.shipping.recipientPhone);
        setShippingAddress(res.shipping.shippingAddress);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail pesanan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleOrderAction = async (action: 'confirm' | 'cancel' | 'complete', reason?: string) => {
    if (!id) return;
    try {
      await apiFetch(`/api/orders/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      });
      toast.success('Status pesanan berhasil diperbarui.');
      setCancelOpen(false);
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui status.');
    }
  };

  const handleDeleteOrder = async () => {
    if (!id) return;
    try {
      await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
      toast.success('Draf pesanan berhasil dihapus.');
      navigate('/orders');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Pesanan tidak dapat dihapus.');
      setDeleteOpen(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, fileName } = await readAndCompressImageFile(file);
      setDesignFileUrl(dataUrl);
      setDesignFileName(fileName);
      if (!designTitle) setDesignTitle(fileName.replace(/\.[^/.]+$/, ''));
      toast.success('File desain siap diunggah.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'File tidak valid.');
    }
  };

  const handleUploadDesign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !designFileUrl) {
      toast.error('Pilih file gambar desain terlebih dahulu.');
      return;
    }
    setSubmittingDesign(true);
    try {
      await apiFetch(`/api/orders/${id}/designs`, {
        method: 'POST',
        body: JSON.stringify({
          fileType: isCustomer ? 'customer_reference' : designType,
          title: designTitle || 'Desain Pesanan',
          fileName: designFileName || 'desain.jpg',
          fileUrl: designFileUrl,
          notes: designNotes,
        }),
      });
      toast.success('File desain berhasil disimpan.');
      setUploadOpen(false);
      setDesignTitle('');
      setDesignNotes('');
      setDesignFileUrl('');
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah desain.');
    } finally {
      setSubmittingDesign(false);
    }
  };

  const handleApproveDesign = async (designId: string) => {
    if (!id) return;
    try {
      await apiFetch(`/api/orders/${id}/designs/${designId}/approve`, { method: 'POST' });
      toast.success('Desain disetujui dan ditetapkan sebagai acuan resmi produksi.');
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyetujui desain.');
    }
  };

  const handleRequestRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !revisionNotes.trim()) return;
    try {
      await apiFetch(`/api/orders/${id}/designs/revision`, {
        method: 'POST',
        body: JSON.stringify({
          designFileId: revisionTargetId,
          revisionNotes,
        }),
      });
      toast.success('Permintaan revisi desain telah dikirim.');
      setRevisionOpen(false);
      setRevisionNotes('');
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal meminta revisi.');
    }
  };

  const handleSaveShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await apiFetch(`/api/orders/${id}/shipping`, {
        method: 'PUT',
        body: JSON.stringify({
          courierName,
          trackingNumber,
          recipientName,
          recipientPhone,
          shippingAddress,
          status: shipStatus,
        }),
      });
      toast.success('Informasi pengiriman berhasil diperbarui.');
      setShipOpen(false);
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui pengiriman.');
    }
  };

  if (loading) return <TableSkeleton rows={6} />;
  if (error || !detail) {
    return <ErrorBanner message={error || 'Pesanan tidak ditemukan.'} onRetry={loadDetail} />;
  }

  const { order, customer } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${order.orderNumber} — ${order.title}`}
        description={`Pelanggan: ${customer.name} · Kategori: ${order.category} · Deadline: ${formatDateId(
          order.deadline
        )}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(isCustomer ? '/portal/orders' : '/orders')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </Button>

            {canManage && order.orderStatus === 'menunggu_konfirmasi' && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleOrderAction('confirm')}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Konfirmasi Pesanan</span>
              </Button>
            )}

            {canManage && order.orderStatus !== 'dibatalkan' && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/orders/${order.id}/edit`)}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </Button>
            )}

            {canManage &&
              order.orderStatus !== 'dibatalkan' &&
              order.orderStatus !== 'selesai' && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Batalkan</span>
                </Button>
              )}
          </div>
        }
      />

      {/* Separated 4-Domain Status Strip (Business Rule #8) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div>
          <div className="text-xs text-slate-500">1. Status Pesanan</div>
          <div className="mt-1.5">
            <StatusIndicator
              status={order.isOverdue ? 'terlambat' : order.orderStatus}
              label={
                order.isOverdue
                  ? `${ORDER_STATUS_LABELS[order.orderStatus]} (Terlambat)`
                  : ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus
              }
            />
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">2. Status Desain</div>
          <div className="mt-1.5">
            <StatusIndicator
              status={order.designStatus}
              label={DESIGN_STATUS_LABELS[order.designStatus] || order.designStatus}
            />
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">3. Status Produksi</div>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusIndicator
              status={order.productionStatus}
              label={PRODUCTION_STATUS_LABELS[order.productionStatus] || order.productionStatus}
            />
            {!isCustomer && detail.productionJob && (
              <Link
                to={`/production/${detail.productionJob.id}`}
                className="text-xs text-indigo-600 hover:underline"
              >
                Detail →
              </Link>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">4. Status Pembayaran</div>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusIndicator
              status={order.paymentStatus}
              label={PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
            />
            {detail.invoice && (
              <Link
                to={
                  isCustomer
                    ? `/portal/invoices`
                    : `/invoices/${detail.invoice.id}`
                }
                className="text-xs text-indigo-600 hover:underline"
              >
                Invoice →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <SegmentedTabs
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'items', label: 'Rincian Produk & Harga', count: detail.items.length },
          { value: 'design', label: 'Desain & Revisi', count: detail.designFiles.length },
          { value: 'shipping', label: 'Pengiriman & Tracking Publik' },
          { value: 'history', label: 'Riwayat Perubahan Status', count: detail.statusHistory.length },
        ]}
      />

      {/* TAB 1: ITEMS & PRICING */}
      {activeTab === 'items' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80">
              <h2 className="text-sm font-semibold text-slate-900">Daftar Item Produk</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Produk & Spesifikasi</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4 text-right">Harga Satuan</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {detail.items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{it.productName}</div>
                        {it.specifications && (
                          <div className="text-slate-500 mt-0.5">{it.specifications}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {formatRupiah(it.unitPrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatRupiah(it.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-5 border-t border-slate-200/80 bg-slate-50/50 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatRupiah(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Biaya Tambahan</span>
                <span className="font-mono tabular-nums">+ {formatRupiah(order.additionalCost)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Diskon</span>
                <span className="font-mono tabular-nums">- {formatRupiah(order.discount)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                <span>Grand Total</span>
                <span className="font-mono tabular-nums text-indigo-600">
                  {formatRupiah(order.grandTotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Pembayaran Terverifikasi</span>
                <span className="font-mono tabular-nums text-emerald-700 font-medium">
                  {formatRupiah(order.paidAmount)}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900">Spesifikasi & Catatan</h3>
              <div>
                <div className="text-slate-500">Spesifikasi Produksi:</div>
                <p className="mt-1 text-slate-800 leading-relaxed">
                  {order.specifications || 'Tidak ada spesifikasi tambahan.'}
                </p>
              </div>
              <div>
                <div className="text-slate-500">Catatan Pesanan:</div>
                <p className="mt-1 text-slate-800 leading-relaxed">
                  {order.notes || 'Tidak ada catatan khusus.'}
                </p>
              </div>
              {order.cancelReason && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                  <strong>Alasan Pembatalan:</strong> {order.cancelReason}
                </div>
              )}
            </div>

            {canManage && order.productionStatus === 'menunggu_produksi' && order.paidAmount === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
                <div className="text-xs text-slate-600">
                  Hapus draf pesanan (hanya sebelum produksi dimulai)
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Hapus</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DESIGN & REVISION */}
      {activeTab === 'design' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Manajemen File Desain, Versioning & Persetujuan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Desain yang disetujui otomatis dikunci menjadi acuan resmi untuk staf produksi.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setDesignType(isCustomer ? 'customer_reference' : 'design_proof');
                setUploadOpen(true);
              }}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isCustomer ? 'Unggah Referensi Desain' : 'Unggah Versi Desain'}</span>
            </Button>
          </div>

          {detail.designFiles.length === 0 ? (
            <EmptyState
              title="Belum Ada File Desain"
              description="Unggah draf desain produksi atau referensi pelanggan untuk memulai proses review dan approval."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {detail.designFiles.map((df) => (
                <div
                  key={df.id}
                  className={`bg-white rounded-xl p-5 border ${
                    df.isProductionReference ? 'border-emerald-500' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 font-mono">
                        {df.fileType === 'design_proof'
                          ? `Proof Produksi · Versi v${df.version}`
                          : 'Referensi Pelanggan'}
                      </div>
                      <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{df.title}</h3>
                    </div>
                    <StatusIndicator
                      status={df.approvalStatus}
                      label={DESIGN_STATUS_LABELS[df.approvalStatus] || df.approvalStatus}
                    />
                  </div>

                  {/* Image Preview */}
                  <div className="mt-4 h-44 bg-slate-100 rounded-lg overflow-hidden border border-slate-200/80 flex items-center justify-center">
                    <img
                      src={df.fileUrl}
                      alt={df.title}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain cursor-pointer"
                      onClick={() => setPreviewUrl(df.fileUrl)}
                    />
                  </div>

                  {df.notes && <p className="mt-3 text-xs text-slate-600">{df.notes}</p>}

                  <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                    <div>
                      Diunggah oleh <strong>{df.uploadedByName}</strong> pada{' '}
                      <span className="font-mono">{formatDateTimeId(df.createdAt)}</span>
                    </div>
                    {df.approvedAt && (
                      <div className="text-emerald-700 font-medium">
                        Disetujui oleh {df.approvedByName} pada{' '}
                        <span className="font-mono">{formatDateTimeId(df.approvedAt)}</span> (Acuan
                        Produksi Resmi)
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setPreviewUrl(df.fileUrl)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Perbesar</span>
                    </Button>

                    {df.fileType === 'design_proof' && df.approvalStatus !== 'disetujui' && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleApproveDesign(df.id)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Setujui Desain</span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setRevisionTargetId(df.id);
                            setRevisionOpen(true);
                          }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Minta Revisi</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Revision History */}
          {detail.designRevisions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Catatan Permintaan Revisi
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                {detail.designRevisions.map((rev) => (
                  <div key={rev.id} className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        Revisi #{rev.revisionNumber} · {rev.requestedByName}
                      </div>
                      <p className="mt-1 text-slate-600">{rev.revisionNotes}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusIndicator
                        status={rev.status === 'resolved' ? 'selesai' : 'revisi'}
                        label={rev.status === 'resolved' ? 'Selesai Direvisi' : 'Menunggu Revisi'}
                      />
                      <div className="mt-1 text-[11px] font-mono text-slate-400">
                        {formatDateTimeId(rev.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SHIPPING & PUBLIC TRACKING */}
      {activeTab === 'shipping' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Informasi Pengiriman</h2>
              {canManage && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setShipOpen(true)}>
                  <Truck className="w-3.5 h-3.5" />
                  <span>Update Pengiriman</span>
                </Button>
              )}
            </div>

            {detail.shipping && (
              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status Pengiriman</span>
                  <StatusIndicator
                    status={detail.shipping.status}
                    label={detail.shipping.status.replace(/_/g, ' ').toUpperCase()}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ekspedisi / Metode</span>
                  <span className="font-medium">{detail.shipping.courierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Nomor Resi</span>
                  <span className="font-mono">{detail.shipping.trackingNumber || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Penerima</span>
                  <span>
                    {detail.shipping.recipientName} ({detail.shipping.recipientPhone})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Alamat Tujuan:</span>
                  <span className="mt-1 block text-slate-900">
                    {detail.shipping.shippingAddress}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Akses Halaman Tracking Pelanggan
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bagikan kode tracking dan 4 digit PIN di bawah kepada pelanggan untuk memantau
              progres produksi tanpa perlu login internal.
            </p>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Kode Tracking Aman:</span>
                <span className="font-mono font-bold text-slate-900">{order.trackingToken}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">PIN Verifikasi (4 Digit):</span>
                <span className="font-mono font-bold text-indigo-600">{order.trackingPin}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/track/${order.trackingToken}`;
                  void navigator.clipboard.writeText(
                    `Lacak pesanan ${order.orderNumber} di ${url} (PIN: ${order.trackingPin})`
                  );
                  toast.success('Tautan tracking & PIN berhasil disalin.');
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Info Tracking</span>
              </Button>
              <Link
                to={`/track/${order.trackingToken}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline"
              >
                <span>Buka Halaman Tracking</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT STATUS HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">
            Log Perubahan Status Pesanan, Desain, Produksi & Pembayaran
          </h2>
          <div className="divide-y divide-slate-100 text-xs">
            {detail.statusHistory.map((h) => (
              <div key={h.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900">
                    [{h.domain.toUpperCase()}] {h.fromStatus ? `${h.fromStatus} → ` : ''}
                    {h.toStatus}
                  </div>
                  <div className="text-slate-500 mt-0.5">{h.reason}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-slate-700 font-medium">{h.actorName}</div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400">
                    {formatDateTimeId(h.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Konfirmasi Pembatalan Pesanan"
        description="Pembatalan akan dicatat dalam riwayat audit pesanan."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Alasan Pembatalan *
            </label>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Tuliskan alasan pembatalan pesanan..."
              className="w-full p-3 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
              Tutup
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleOrderAction('cancel', cancelReason || 'Dibatalkan')}
            >
              Batalkan Pesanan
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Draft Confirm Dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDeleteOrder()}
        title="Hapus Draf Pesanan"
        message="Apakah Anda yakin ingin menghapus draf pesanan ini secara permanen?"
        confirmLabel="Hapus Permanen"
      />

      {/* Upload Design Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={isCustomer ? 'Unggah Referensi Desain' : 'Unggah File Desain Baru'}
        description="Mendukung unggahan gambar langsung dari perangkat (JPG, PNG, WEBP, SVG)."
      >
        <form onSubmit={handleUploadDesign} className="space-y-4">
          {!isCustomer && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tipe File</label>
              <select
                value={designType}
                onChange={(e) =>
                  setDesignType(e.target.value as 'design_proof' | 'customer_reference')
                }
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
              >
                <option value="design_proof">Proof Desain Produksi (Versi Baru)</option>
                <option value="customer_reference">File Referensi Pelanggan</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Judul Desain *</label>
            <input
              type="text"
              required
              value={designTitle}
              onChange={(e) => setDesignTitle(e.target.value)}
              placeholder="Contoh: Mockup Kaos Depan Belakang Final"
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Pilih File Gambar *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFilePick}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:text-xs file:font-medium file:bg-slate-50 hover:file:bg-slate-100"
            />
            {designFileUrl && (
              <img
                src={designFileUrl}
                alt="Preview"
                className="mt-2 h-32 rounded-lg border border-slate-200 object-contain"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Desain</label>
            <textarea
              rows={2}
              value={designNotes}
              onChange={(e) => setDesignNotes(e.target.value)}
              placeholder="Detail ukuran cetak, warna, atau catatan revisi..."
              className="w-full p-2.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setUploadOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submittingDesign}>
              {submittingDesign ? 'Mengunggah...' : 'Simpan Desain'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Request Revision Modal */}
      <Modal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        title="Ajukan Revisi Desain"
        description="Jelaskan bagian desain yang perlu diperbaiki secara spesifik."
      >
        <form onSubmit={handleRequestRevision} className="space-y-4">
          <textarea
            rows={4}
            required
            value={revisionNotes}
            onChange={(e) => setRevisionNotes(e.target.value)}
            placeholder="Contoh: Geser logo dada kiri naik 2cm dan perbesar teks belakang..."
            className="w-full p-3 text-xs border border-slate-200 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRevisionOpen(false)}>
              Batal
            </Button>
            <Button type="submit">Kirim Permintaan Revisi</Button>
          </div>
        </form>
      </Modal>

      {/* Update Shipping Modal */}
      <Modal
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="Perbarui Pengiriman Pesanan"
      >
        <form onSubmit={handleSaveShipping} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kurir / Metode</label>
              <input
                type="text"
                required
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={shipStatus}
                onChange={(e) =>
                  setShipStatus(
                    e.target.value as 'belum_dikirim' | 'dikemas' | 'dikirim' | 'diterima'
                  )
                }
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
              >
                <option value="belum_dikirim">Belum Dikirim</option>
                <option value="dikemas">Sedang Dikemas</option>
                <option value="dikirim">Dalam Pengiriman</option>
                <option value="diterima">Diterima Pelanggan</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Resi</label>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Contoh: JTR8829104421"
              className="w-full h-9 px-3 text-xs font-mono border border-slate-200 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Penerima</label>
              <input
                type="text"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">No. Telepon</label>
              <input
                type="text"
                required
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Tujuan</label>
            <textarea
              rows={2}
              required
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShipOpen(false)}>
              Batal
            </Button>
            <Button type="submit">Simpan Pengiriman</Button>
          </div>
        </form>
      </Modal>

      {/* Lightbox Image Preview Modal */}
      <Modal
        open={Boolean(previewUrl)}
        onClose={() => setPreviewUrl(null)}
        title="Pratinjau File Desain"
        maxWidth="max-w-3xl"
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Pratinjau Desain"
            className="w-full max-h-[70vh] object-contain rounded-lg bg-slate-50"
          />
        )}
      </Modal>
    </div>
  );
}
