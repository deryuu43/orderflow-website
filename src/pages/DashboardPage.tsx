import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Plus,
  Database,
  AlertTriangle,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  PageHeader,
  Button,
  StatusIndicator,
  ErrorBanner,
  TableSkeleton,
} from '../components/ui/DesignSystem.tsx';
import {
  formatRupiah,
  formatDateId,
  formatDateTimeId,
  ORDER_STATUS_LABELS,
  PRODUCTION_STATUS_LABELS,
} from '../lib/formatters.ts';
import { toast } from 'sonner';

interface DashboardData {
  stats: {
    totalOrders: number;
    newOrders: number;
    inProduction: number;
    completedOrders: number;
    overdueOrders: number;
    confirmedRevenue: number;
    pendingPaymentCount: number;
  };
  monthlySeries: Array<{
    key: string;
    month: string;
    pesanan: number;
    pendapatan: number;
  }>;
  productionDistribution: Array<{
    status: string;
    name: string;
    jumlah: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    title: string;
    customerName: string;
    grandTotal: number;
    orderStatus: string;
    productionStatus: string;
    deadline: string;
    isOverdue: boolean;
  }>;
  nearestDeadlines: Array<{
    id: string;
    orderNumber: string;
    title: string;
    customerName: string;
    deadline: string;
    productionStatus: string;
    isOverdue: boolean;
  }>;
  attentionItems: Array<{
    id: string;
    orderId: string;
    severity: 'critical' | 'warning' | 'info';
    category: string;
    title: string;
    subtitle: string;
  }>;
  recentActivities: Array<{
    id: string;
    actorName: string;
    description: string;
    createdAt: string;
  }>;
}

export function DashboardPage() {
  const { apiFetch, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data dashboard.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleSeedWorkspace = async () => {
    setSeeding(true);
    try {
      await apiFetch('/api/workspace/seed', { method: 'POST' });
      toast.success('Data operasional contoh berhasil disimpan ke database PostgreSQL.');
      await refreshProfile();
      await loadDashboard();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat data contoh.');
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Ringkasan Operasional"
          description="Memuat metrik pesanan, produksi, dan pembayaran dari database..."
        />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ringkasan Operasional" />
        <ErrorBanner message={error || 'Data tidak tersedia.'} onRetry={loadDashboard} />
      </div>
    );
  }

  const canManageOrders =
    profile?.effectiveRole === 'owner' || profile?.effectiveRole === 'admin';

  const statCards = [
    {
      label: 'Total Pesanan',
      value: data.stats.totalOrders.toLocaleString('id-ID'),
      sub: 'Seluruh pesanan aktif & selesai',
    },
    {
      label: 'Pesanan Baru',
      value: data.stats.newOrders.toLocaleString('id-ID'),
      sub: 'Menunggu konfirmasi awal',
    },
    {
      label: 'Dalam Produksi',
      value: data.stats.inProduction.toLocaleString('id-ID'),
      sub: 'Persiapan, produksi & QC',
    },
    {
      label: 'Selesai',
      value: data.stats.completedOrders.toLocaleString('id-ID'),
      sub: 'Lulus QC & tuntas',
    },
    {
      label: 'Terlambat',
      value: data.stats.overdueOrders.toLocaleString('id-ID'),
      sub: 'Melewati batas deadline',
      danger: data.stats.overdueOrders > 0,
    },
    {
      label: 'Total Pendapatan',
      value: formatRupiah(data.stats.confirmedRevenue),
      sub: 'Pembayaran terverifikasi',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Operasional"
        description={`Pantau performa pesanan custom, kapasitas produksi, dan arus kas terverifikasi di ${
          profile?.businessName || 'workspace Anda'
        }.`}
        actions={
          canManageOrders ? (
            <Button type="button" onClick={() => navigate('/orders/create')}>
              <Plus className="w-4 h-4" />
              <span>Tambah Pesanan</span>
            </Button>
          ) : undefined
        }
      />

      {/* Onboarding Banner ONLY when workspace database has 0 orders */}
      {data.stats.totalOrders === 0 && profile?.actualRole === 'owner' && (
        <div className="bg-white border border-indigo-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Workspace Bisnis Anda Siap Digunakan
            </h2>
            <p className="mt-1 text-xs text-slate-600 max-w-2xl leading-relaxed">
              Database PostgreSQL saat ini masih kosong (0 pesanan). Anda dapat langsung
              menambahkan pelanggan & pesanan pertama secara manual, atau memuat 4 transaksi
              operasional contoh ke database untuk menguji alur Kanban, QC, dan Invoice PDF.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSeedWorkspace}
              disabled={seeding}
            >
              <Database className="w-4 h-4 text-indigo-600" />
              <span>{seeding ? 'Menyimpan ke DB...' : 'Muat Data Contoh ke DB'}</span>
            </Button>
            <Button type="button" onClick={() => navigate('/orders/create')}>
              <Plus className="w-4 h-4" />
              <span>Buat Pesanan Pertama</span>
            </Button>
          </div>
        </div>
      )}

      {/* 6 Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
          >
            <div className="text-xs font-medium text-slate-500">{card.label}</div>
            <div
              className={`mt-2 text-lg font-bold font-mono tabular-nums truncate ${
                card.danger ? 'text-red-600' : 'text-slate-900'
              }`}
              title={card.value}
            >
              {card.value}
            </div>
            <div className="mt-1.5 text-[11px] text-slate-400 truncate">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row: Monthly Revenue, Monthly Orders & Production Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Pendapatan Bulanan Terverifikasi
              </h2>
              <p className="text-xs text-slate-500">6 bulan terakhir (IDR)</p>
            </div>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}jt` : `${v / 1000}rb`
                  }
                />
                <Tooltip
                  formatter={(val) => [formatRupiah(Number(val ?? 0)), 'Pendapatan']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pendapatan"
                  stroke="#4f46e5"
                  fill="#eef2ff"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Volume Pesanan Bulanan</h2>
            <p className="text-xs text-slate-500">Jumlah pesanan masuk per bulan</p>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlySeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val) => [`${Number(val ?? 0)} pesanan`, 'Volume']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="pesanan" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Distribusi Status Produksi</h2>
            <p className="text-xs text-slate-500 mb-4">Beban kerja aktif di lantai produksi</p>
            <div className="space-y-3">
              {data.productionDistribution.map((stage) => {
                const pct =
                  data.stats.totalOrders > 0
                    ? Math.round((stage.jumlah / data.stats.totalOrders) * 100)
                    : 0;
                return (
                  <div key={stage.status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-700">{stage.name}</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900">
                        {stage.jumlah}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Link
            to="/production"
            className="mt-5 pt-3 border-t border-slate-100 inline-flex items-center justify-between text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            <span>Buka Papan Produksi Kanban</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Attention Needed & Nearest Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Pekerjaan yang Membutuhkan Perhatian
              </h2>
              <p className="text-xs text-slate-500">
                Keterlambatan, verifikasi pembayaran, dan revisi desain
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {data.attentionItems.length} item
            </span>
          </div>

          {data.attentionItems.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-slate-500">
              Tidak ada kendala mendesak. Seluruh pesanan berjalan sesuai jadwal.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.attentionItems.map((item) => (
                <Link
                  key={item.id}
                  to={`/orders/${item.orderId}`}
                  className="px-5 py-3.5 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          item.severity === 'critical'
                            ? 'text-red-600'
                            : item.severity === 'warning'
                            ? 'text-amber-600'
                            : 'text-indigo-600'
                        }`}
                      />
                      <span className="font-medium text-slate-900 truncate">{item.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">{item.subtitle}</p>
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0">{item.category} →</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Deadline Terdekat</h2>
              <p className="text-xs text-slate-500">Urutan pesanan aktif berdasarkan tenggat</p>
            </div>
            <Link to="/orders" className="text-xs font-medium text-indigo-600 hover:underline">
              Semua Pesanan →
            </Link>
          </div>

          {data.nearestDeadlines.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-slate-500">
              Belum ada deadline pesanan aktif.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.nearestDeadlines.map((dl) => (
                <Link
                  key={dl.id}
                  to={`/orders/${dl.id}`}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      <span className="font-mono">{dl.orderNumber}</span> · {dl.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {dl.customerName} · {PRODUCTION_STATUS_LABELS[dl.productionStatus] || dl.productionStatus}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-mono tabular-nums font-medium ${
                        dl.isOverdue ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {formatDateId(dl.deadline)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {dl.isOverdue ? 'Terlambat' : 'Jadwal Kirim'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders Table & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Pesanan Terbaru</h2>
            <Link to="/orders" className="text-xs font-medium text-indigo-600 hover:underline">
              Kelola Pesanan →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">No. Pesanan</th>
                  <th className="py-2.5 px-4">Pelanggan & Produk</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data.recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      Belum ada data pesanan.
                    </td>
                  </tr>
                ) : (
                  data.recentOrders.map((ord) => (
                    <tr
                      key={ord.id}
                      onClick={() => navigate(`/orders/${ord.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums font-medium text-indigo-600 whitespace-nowrap">
                        {ord.orderNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 truncate max-w-[240px]">
                          {ord.title}
                        </div>
                        <div className="text-slate-500">{ord.customerName}</div>
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
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {formatRupiah(ord.grandTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Aktivitas Terbaru</h2>
          {data.recentActivities.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada aktivitas tercatat.</p>
          ) : (
            <div className="space-y-3.5">
              {data.recentActivities.map((act) => (
                <div key={act.id} className="flex items-start gap-2.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-slate-700 leading-snug">{act.description}</p>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {act.actorName} ·{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateTimeId(act.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
