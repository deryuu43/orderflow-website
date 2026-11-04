import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Search,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Camera,
  ClipboardCheck,
  Clock,
  ChevronRight,
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
  formatDateId,
  formatDateTimeId,
  PRODUCTION_STATUS_LABELS,
} from '../lib/formatters.ts';
import { readAndCompressImageFile } from '../lib/fileUpload.ts';
import { toast } from 'sonner';

const KANBAN_COLUMNS = [
  { key: 'menunggu_produksi', label: 'Menunggu Produksi' },
  { key: 'persiapan', label: 'Persiapan' },
  { key: 'dalam_produksi', label: 'Dalam Produksi' },
  { key: 'quality_control', label: 'Quality Control' },
  { key: 'siap_dikirim', label: 'Siap Dikirim' },
  { key: 'selesai', label: 'Selesai' },
] as const;

interface KanbanJob {
  id: string;
  orderId: string;
  jobNumber: string;
  status: string;
  priority: string;
  assignedStaffUid: string | null;
  assignedStaffName: string | null;
  deadline: string;
  qcPassed: boolean;
  isOverdue: boolean;
  readiness: {
    orderConfirmed: boolean;
    dpFulfilled: boolean;
    designReady: boolean;
    canStartProduction: boolean;
  };
  order: {
    id: string;
    orderNumber: string;
    title: string;
    category: string;
  };
  customer: {
    name: string;
    company?: string;
  };
}

export function ProductionKanbanPage() {
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<KanbanJob[]>([]);
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<'all' | 'mine' | 'overdue'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ jobs: KanbanJob[] }>('/api/production');
      setJobs(res.jobs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat papan produksi.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const handleQuickMove = async (job: KanbanJob, nextStatus: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/production/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(`Tahap produksi ${job.order.orderNumber} diperbarui.`);
      await loadBoard();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memindahkan tahap produksi.');
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (viewFilter === 'mine' && j.assignedStaffUid !== profile?.uid) return false;
    if (viewFilter === 'overdue' && !j.isOverdue) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        j.order.orderNumber.toLowerCase().includes(q) ||
        j.order.title.toLowerCase().includes(q) ||
        j.customer.name.toLowerCase().includes(q) ||
        (j.assignedStaffName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Produksi Kanban"
        description="Kontrol pengerjaan lantai produksi, penugasan staf, indikator keterlambatan, dan gerbang Quality Control."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SegmentedTabs
          value={viewFilter}
          onChange={setViewFilter}
          options={[
            { value: 'all', label: 'Semua Pekerjaan', count: jobs.length },
            {
              value: 'mine',
              label: 'Ditugaskan ke Saya',
              count: jobs.filter((j) => j.assignedStaffUid === profile?.uid).length,
            },
            {
              value: 'overdue',
              label: 'Melewati Deadline',
              count: jobs.filter((j) => j.isOverdue).length,
            },
          ]}
        />

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari order, produk, atau staf..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadBoard} />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="Belum Ada Antrean Produksi"
          description="Setiap pesanan baru yang dibuat di modul Pesanan akan otomatis masuk ke papan produksi Kanban."
        />
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="grid grid-cols-6 gap-4 min-w-[1320px]">
            {KANBAN_COLUMNS.map((col) => {
              const colJobs = filteredJobs.filter((j) => j.status === col.key);
              return (
                <div
                  key={col.key}
                  className="bg-slate-100/80 border border-slate-200/80 rounded-xl p-3 flex flex-col min-h-[520px]"
                >
                  <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-slate-200/80">
                    <h2 className="text-xs font-semibold text-slate-800">{col.label}</h2>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {colJobs.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 flex-1">
                    {colJobs.map((job) => (
                      <div
                        key={job.id}
                        onClick={() => navigate(`/production/${job.id}`)}
                        className="bg-white border border-slate-200 rounded-lg p-3.5 hover:border-indigo-300 cursor-pointer transition-colors space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono font-semibold text-indigo-600">
                            {job.order.orderNumber}
                          </span>
                          <span
                            className={`font-medium ${
                              job.priority === 'mendesak'
                                ? 'text-red-600'
                                : job.priority === 'tinggi'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {job.priority.toUpperCase()}
                          </span>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-900 line-clamp-2">
                            {job.order.title}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {job.customer.name}
                          </div>
                        </div>

                        {/* Readiness & QC Indicators */}
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {job.qcPassed ? (
                            <span className="text-emerald-700 inline-flex items-center gap-1 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> QC Lolos
                            </span>
                          ) : !job.readiness.canStartProduction &&
                            job.status === 'menunggu_produksi' ? (
                            <span className="text-amber-700 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Menunggu DP/Desain
                            </span>
                          ) : null}
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 truncate max-w-[100px]">
                            {job.assignedStaffName || 'Belum ditugaskan'}
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              job.isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'
                            }`}
                          >
                            {formatDateId(job.deadline)}
                          </span>
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          <select
                            value={job.status}
                            onChange={(e) => void handleQuickMove(job, e.target.value, e)}
                            aria-label="Ubah status produksi"
                            className="w-full h-7 px-2 text-[11px] bg-slate-50 border border-slate-200 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                          >
                            {KANBAN_COLUMNS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                → {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProductionJobDetailData {
  job: {
    id: string;
    orderId: string;
    jobNumber: string;
    status: string;
    priority: 'normal' | 'tinggi' | 'mendesak';
    assignedStaffUid: string | null;
    assignedStaffName: string | null;
    deadline: string;
    productionNotes: string;
    photos: Array<{
      id: string;
      url: string;
      caption: string;
      uploadedBy: string;
      uploadedAt: string;
    }>;
    qcPassed: boolean;
    isOverdue: boolean;
  };
  order: {
    id: string;
    orderNumber: string;
    title: string;
    category: string;
    specifications: string;
    orderStatus: string;
    designStatus: string;
    paymentStatus: string;
    minDpPercent: number;
    grandTotal: number;
    paidAmount: number;
  };
  customer: {
    name: string;
    company?: string;
    phone: string;
  };
  items: Array<{
    id: string;
    productName: string;
    specifications: string;
    quantity: number;
    unit: string;
  }>;
  approvedDesign: {
    id: string;
    version: number;
    title: string;
    fileUrl: string;
    approvedByName: string | null;
    approvedAt: string | null;
  } | null;
  logs: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    notes: string;
    actorName: string;
    createdAt: string;
  }>;
  qcInspections: Array<{
    id: string;
    inspectorName: string;
    passed: boolean;
    checklist: {
      materialChecked: boolean;
      dimensionChecked: boolean;
      printColorChecked: boolean;
      finishingChecked: boolean;
    };
    notes: string;
    inspectedAt: string;
  }>;
  staffMembers: Array<{
    id: string;
    uid: string;
    fullName: string;
    role: string;
  }>;
  readiness: {
    orderConfirmed: boolean;
    dpFulfilled: boolean;
    minDpAmount: number;
    designReady: boolean;
    canStartProduction: boolean;
  };
}

export function ProductionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, profile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<ProductionJobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Job Update State
  const [status, setStatus] = useState('menunggu_produksi');
  const [priority, setPriority] = useState<'normal' | 'tinggi' | 'mendesak'>('normal');
  const [assignedUid, setAssignedUid] = useState('');
  const [prodNotes, setProdNotes] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [savingJob, setSavingJob] = useState(false);

  // QC Modal State
  const [qcOpen, setQcOpen] = useState(false);
  const [materialChecked, setMaterialChecked] = useState(true);
  const [dimensionChecked, setDimensionChecked] = useState(true);
  const [printColorChecked, setPrintColorChecked] = useState(true);
  const [finishingChecked, setFinishingChecked] = useState(true);
  const [qcNotes, setQcNotes] = useState('');

  // Photo Upload Modal
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');

  const canAssignStaff =
    profile?.effectiveRole === 'owner' || profile?.effectiveRole === 'admin';

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ProductionJobDetailData>(`/api/production/${id}`);
      setData(res);
      setStatus(res.job.status);
      setPriority(res.job.priority);
      setAssignedUid(res.job.assignedStaffUid || '');
      setProdNotes(res.job.productionNotes || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail pekerjaan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !data) return;
    setSavingJob(true);
    try {
      const staffObj = data.staffMembers.find((s) => s.uid === assignedUid);
      await apiFetch(`/api/production/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          priority,
          assignedStaffUid: canAssignStaff ? assignedUid || null : undefined,
          assignedStaffName: canAssignStaff ? staffObj?.fullName || null : undefined,
          productionNotes: prodNotes,
          logNotes: logNotes || undefined,
        }),
      });
      setLogNotes('');
      toast.success('Status dan catatan pekerjaan produksi berhasil disimpan.');
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pembaruan produksi.');
    } finally {
      setSavingJob(false);
    }
  };

  const handleSubmitQc = async (passed: boolean) => {
    if (!id) return;
    try {
      await apiFetch(`/api/production/${id}/qc`, {
        method: 'POST',
        body: JSON.stringify({
          passed,
          checklist: {
            materialChecked,
            dimensionChecked,
            printColorChecked,
            finishingChecked,
          },
          notes: qcNotes,
        }),
      });
      toast.success(
        passed
          ? 'Pemeriksaan QC dinyatakan LOLOS. Pesanan kini dapat dikirim/diselesaikan.'
          : 'QC dicatat perlu rework dan dikembalikan ke tahap Dalam Produksi.'
      );
      setQcOpen(false);
      setQcNotes('');
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan QC.');
    }
  };

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, fileName } = await readAndCompressImageFile(file);
      setPhotoUrl(dataUrl);
      if (!photoCaption) setPhotoCaption(`Hasil produksi — ${fileName}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'File tidak valid.');
    }
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !photoUrl) {
      toast.error('Pilih foto hasil produksi terlebih dahulu.');
      return;
    }
    try {
      await apiFetch(`/api/production/${id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ url: photoUrl, caption: photoCaption }),
      });
      toast.success('Foto hasil produksi berhasil diunggah.');
      setPhotoOpen(false);
      setPhotoUrl('');
      setPhotoCaption('');
      await loadDetail();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah foto.');
    }
  };

  if (loading) return <TableSkeleton rows={6} />;
  if (error || !data) {
    return <ErrorBanner message={error || 'Data tidak ditemukan.'} onRetry={loadDetail} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.job.jobNumber} · ${data.order.title}`}
        description={`Pesanan: ${data.order.orderNumber} · Pelanggan: ${
          data.customer.name
        } · Deadline: ${formatDateId(data.job.deadline)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate('/production')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Papan Kanban</span>
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPhotoOpen(true)}>
              <Camera className="w-3.5 h-3.5" />
              <span>Unggah Foto Produksi</span>
            </Button>
            <Button type="button" size="sm" onClick={() => setQcOpen(true)}>
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Inspeksi QC</span>
            </Button>
          </div>
        }
      />

      {/* Production Readiness Gate Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-slate-500 block">Konfirmasi Pesanan</span>
          <div className="mt-1">
            <StatusIndicator
              status={data.readiness.orderConfirmed ? 'selesai' : 'pending'}
              label={data.readiness.orderConfirmed ? 'Terkonfirmasi' : 'Belum Dikonfirmasi'}
            />
          </div>
        </div>
        <div>
          <span className="text-slate-500 block">Syarat Pembayaran DP</span>
          <div className="mt-1">
            <StatusIndicator
              status={data.readiness.dpFulfilled ? 'selesai' : 'pending'}
              label={data.readiness.dpFulfilled ? 'DP Terpenuhi' : 'Menunggu Verifikasi DP'}
            />
          </div>
        </div>
        <div>
          <span className="text-slate-500 block">Acuan Desain Produksi</span>
          <div className="mt-1">
            <StatusIndicator
              status={data.readiness.designReady ? 'selesai' : 'revisi'}
              label={data.readiness.designReady ? 'Desain Disetujui' : 'Belum Disetujui'}
            />
          </div>
        </div>
        <div>
          <span className="text-slate-500 block">Status Quality Control (QC)</span>
          <div className="mt-1">
            <StatusIndicator
              status={data.job.qcPassed ? 'selesai' : 'pending'}
              label={data.job.qcPassed ? 'QC LOLOS' : 'Belum Lolos QC'}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Specs, Approved Design, Photos */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Spesifikasi Produk & Item Dikerjakan
              </h2>
              <Link
                to={`/orders/${data.order.id}`}
                className="text-xs font-medium text-indigo-600 inline-flex items-center gap-1 hover:underline"
              >
                <span>Buka Detail Pesanan</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data.order.specifications && (
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs text-slate-700">
                <strong className="text-slate-900 block mb-1">Instruksi Teknis:</strong>
                {data.order.specifications}
              </div>
            )}

            <div className="divide-y divide-slate-100 text-xs">
              {data.items.map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">{item.productName}</div>
                    {item.specifications && (
                      <div className="text-slate-500 mt-0.5">{item.specifications}</div>
                    )}
                  </div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                    {item.quantity} {item.unit}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Official Approved Design Reference */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Acuan Desain Produksi Resmi
            </h2>
            {data.approvedDesign ? (
              <div>
                <div className="h-52 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                  <img
                    src={data.approvedDesign.fileUrl}
                    alt={data.approvedDesign.title}
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    <strong>v{data.approvedDesign.version}</strong> — {data.approvedDesign.title}
                  </span>
                  <span className="text-emerald-700 font-medium">
                    Disetujui {data.approvedDesign.approvedByName}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-700">
                Belum ada file desain yang disetujui untuk pesanan ini.
              </p>
            )}
          </div>

          {/* Production Result Photos */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Dokumentasi Foto Hasil Produksi ({data.job.photos.length})
              </h2>
              <Button type="button" variant="secondary" size="sm" onClick={() => setPhotoOpen(true)}>
                <Camera className="w-3.5 h-3.5" />
                <span>Tambah Foto</span>
              </Button>
            </div>

            {data.job.photos.length === 0 ? (
              <p className="text-xs text-slate-500">
                Belum ada foto dokumentasi hasil produksi yang diunggah.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.job.photos.map((ph) => (
                  <div key={ph.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <img
                      src={ph.url}
                      alt={ph.caption}
                      className="w-full h-36 object-cover bg-slate-100"
                    />
                    <div className="p-2.5 text-xs">
                      <div className="font-medium text-slate-900">{ph.caption}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {ph.uploadedBy} · {formatDateTimeId(ph.uploadedAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Update Form, QC History & Production Logs */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleSaveJob}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-sm font-semibold text-slate-900">Kontrol & Penugasan Produksi</h2>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tahap Produksi Saat Ini
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
              >
                {KANBAN_COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Prioritas</label>
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as 'normal' | 'tinggi' | 'mendesak')
                  }
                  className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  <option value="normal">Normal</option>
                  <option value="tinggi">Tinggi</option>
                  <option value="mendesak">Mendesak</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Staf Penanggung Jawab
                </label>
                <select
                  value={assignedUid}
                  onChange={(e) => setAssignedUid(e.target.value)}
                  disabled={!canAssignStaff}
                  className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg disabled:bg-slate-50"
                >
                  <option value="">-- Belum Ditugaskan --</option>
                  {data.staffMembers.map((st) => (
                    <option key={st.uid} value={st.uid}>
                      {st.fullName} ({st.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan Teknis Produksi
              </label>
              <textarea
                rows={3}
                value={prodNotes}
                onChange={(e) => setProdNotes(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan Log Perubahan (Opsional)
              </label>
              <input
                type="text"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="Contoh: Sablon warna dasar selesai 150 pcs..."
                className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <Button type="submit" disabled={savingJob} className="w-full">
              {savingJob ? 'Menyimpan...' : 'Simpan Pembaruan Produksi'}
            </Button>
          </form>

          {/* QC Inspections List */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Riwayat Inspeksi QC</h2>
            {data.qcInspections.length === 0 ? (
              <p className="text-xs text-slate-500">
                Belum ada pemeriksaan QC. Klik tombol "Inspeksi QC" sebelum menandai pekerjaan
                selesai.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {data.qcInspections.map((qc) => (
                  <div key={qc.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <StatusIndicator
                        status={qc.passed ? 'selesai' : 'dibatalkan'}
                        label={qc.passed ? 'LOLOS QC' : 'TIDAK LOLOS (REWORK)'}
                      />
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatDateTimeId(qc.inspectedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      Pemeriksa: <strong>{qc.inspectorName}</strong>{' '}
                      {qc.notes ? `— ${qc.notes}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Production Logs */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Riwayat Aktivitas Produksi</h2>
            <div className="space-y-3 text-xs">
              {data.logs.map((lg) => (
                <div key={lg.id} className="flex items-start gap-2.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-slate-900">
                      {PRODUCTION_STATUS_LABELS[lg.toStatus] || lg.toStatus}
                    </div>
                    <div className="text-slate-600">{lg.notes}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {lg.actorName} · {formatDateTimeId(lg.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* QC Inspection Modal */}
      <Modal
        open={qcOpen}
        onClose={() => setQcOpen(false)}
        title="Formulir Pemeriksaan Quality Control (QC)"
        description="Produksi tidak dapat dinyatakan Siap Dikirim atau Selesai sebelum QC dinyatakan Lolos."
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            {[
              {
                label: 'Kesesuaian bahan baku & ketebalan material',
                checked: materialChecked,
                setter: setMaterialChecked,
              },
              {
                label: 'Presisi ukuran / dimensi sesuai tabel spesifikasi',
                checked: dimensionChecked,
                setter: setDimensionChecked,
              },
              {
                label: 'Akurasi warna cetak / sablon / bordir sesuai desain disetujui',
                checked: printColorChecked,
                setter: setPrintColorChecked,
              },
              {
                label: 'Kerapian jahitan / potongan / finishing & kebersihan produk',
                checked: finishingChecked,
                setter: setFinishingChecked,
              },
            ].map((item) => (
              <label key={item.label} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.setter(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-slate-800">{item.label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Catatan Pemeriksa QC</label>
            <textarea
              rows={3}
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              placeholder="Catat hasil pengecekan sampel atau temuan cacat produksi..."
              className="w-full p-2.5 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleSubmitQc(false)}
            >
              Tidak Lolos (Rework)
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitQc(true)}
            >
              Nyatakan QC Lolos
            </Button>
          </div>
        </div>
      </Modal>

      {/* Upload Production Photo Modal */}
      <Modal
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        title="Unggah Foto Hasil Produksi"
      >
        <form onSubmit={handleUploadPhoto} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Pilih Foto Hasil Pengerjaan *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePickPhoto}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50"
            />
            {photoUrl && (
              <img
                src={photoUrl}
                alt="Preview"
                className="mt-2 h-36 rounded-lg border border-slate-200 object-cover"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Keterangan Dokumentasi *
            </label>
            <input
              type="text"
              required
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Contoh: Hasil sablon plastisol tampak dekat setelah curing"
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPhotoOpen(false)}>
              Batal
            </Button>
            <Button type="submit">Unggah Foto</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
