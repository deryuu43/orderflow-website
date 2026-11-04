import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Layers,
  ArrowRight,
  Search,
  CheckCircle2,
  ShieldCheck,
  Kanban,
  FileCheck2,
  Receipt,
  Clock,
  Truck,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Button,
  StatusIndicator,
  ErrorBanner,
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
import { toast } from 'sonner';

export function LandingPage() {
  const { firebaseUser, profile } = useAuth();
  const navigate = useNavigate();
  const [trackingCode, setTrackingCode] = useState('');

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = trackingCode.trim().toUpperCase();
    if (!cleaned) {
      toast.error('Masukkan kode tracking pesanan terlebih dahulu.');
      return;
    }
    navigate(`/track/${encodeURIComponent(cleaned)}`);
  };

  const targetWorkspaceUrl =
    profile?.effectiveRole === 'customer' ? '/portal' : '/dashboard';

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 sm:px-10 py-4 border-b border-slate-200/80 max-w-[1360px] w-full mx-auto">
        <Link
          to="/"
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          OrderFlow
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a
            href="#fitur"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Fitur
          </a>
          <a
            href="#alur"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Alur Produksi
          </a>
          <a
            href="#harga"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Harga
          </a>
          <Link
            to="/track"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Lacak Pesanan
          </Link>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={() => navigate(firebaseUser ? targetWorkspaceUrl : '/login')}
          >
            {firebaseUser ? 'Buka Dashboard' : 'Masuk Workspace'}
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 sm:px-10 pt-16 pb-20 max-w-[1200px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="text-xs font-medium text-indigo-600 mb-3">
              Percetakan · Konveksi · Sablon · Merchandise · Furniture Custom
            </div>
            <h1
              className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Kelola Pesanan Custom, Kontrol Produksi, dan Kirim Tepat Waktu.
            </h1>
            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
              Manage Orders. Track Production. Deliver on Time. Satu sistem operasional
              terpadu untuk mencatat spesifikasi custom, persetujuan desain versi, papan
              produksi Kanban, inspeksi QC, hingga verifikasi DP dan pelunasan invoice.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => navigate(firebaseUser ? targetWorkspaceUrl : '/register')}
              >
                <span>Mulai Gunakan OrderFlow</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/track')}
              >
                <Search className="w-4 h-4 text-slate-500" />
                <span>Cek Status Pesanan</span>
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200/80 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
              <span>Multi-tenant terisolasi</span>
              <span aria-hidden="true">·</span>
              <span>4 Role Akses (Owner, Admin, Produksi, Pelanggan)</span>
              <span aria-hidden="true">·</span>
              <span>Invoice PDF Otomatis</span>
            </div>
          </div>

          {/* Right Column: Live Order Tracking Quick Card */}
          <div className="lg:col-span-5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-7">
              <h2 className="text-base font-semibold text-slate-900">
                Lacak Pesanan Pelanggan
              </h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Pelanggan dapat memantau progres desain, tahapan produksi, deadline, dan
                status pembayaran secara langsung menggunakan kode tracking.
              </p>

              <form onSubmit={handleTrackSubmit} className="mt-5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Kode Tracking Pesanan
                  </label>
                  <input
                    type="text"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Contoh: TRK-TS26-A1B2C3"
                    className="w-full h-10 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Lacak Progres Sekarang
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-200/80 space-y-2.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Tahap Produksi</span>
                  <span className="font-mono text-slate-900">6 Tahap Terukur + QC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Keamanan Akses</span>
                  <span className="font-mono text-slate-900">Token + PIN 4 Digit</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Modules Section */}
      <section id="fitur" className="bg-slate-50 border-y border-slate-200/80 py-16 px-6 sm:px-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Dirancang Khusus untuk Operasional Produksi Berbasis Pesanan
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Setiap pesanan custom memiliki spesifikasi unik, revisi desain, dan syarat DP
              sebelum produksi berjalan. OrderFlow menjaga seluruh alur tetap disiplin.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <FileCheck2 className="w-5 h-5 text-indigo-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">
                Versioning & Approval Desain
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Simpan riwayat setiap versi desain, catatan revisi pelanggan, dan kunci
                desain yang disetujui sebagai acuan resmi produksi.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <Kanban className="w-5 h-5 text-indigo-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">
                Kanban Produksi & Gate QC
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Pantau 6 tahapan produksi dari Persiapan hingga Selesai. Pekerjaan wajib
                lulus inspeksi Quality Control sebelum dikirim.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <Receipt className="w-5 h-5 text-indigo-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">
                DP, Cicilan & Verifikasi Admin
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Dukung pembayaran bertahap, unggah bukti transfer, verifikasi admin, dan
                cetak invoice PDF profesional kapan saja.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <ShieldCheck className="w-5 h-5 text-indigo-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">
                Kontrol Akses Multi-Role
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Pisahkan wewenang Owner, Admin, Staf Produksi, dan Portal Pelanggan dengan
                isolasi data antar bisnis yang ketat.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Steps */}
      <section id="alur" className="py-16 px-6 sm:px-10 max-w-[1200px] w-full mx-auto">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Alur Kerja Terkendali dari Pesanan Masuk hingga Pengiriman
        </h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            {
              step: '01. Pencatatan & DP',
              desc: 'Admin membuat pesanan multi-item, menerbitkan invoice otomatis, dan memverifikasi pembayaran DP awal.',
            },
            {
              step: '02. Proofing Desain',
              desc: 'Tim mengunggah draf desain. Pelanggan meninjau lewat portal, meminta revisi, atau menyetujui desain.',
            },
            {
              step: '03. Eksekusi & QC',
              desc: 'Staf produksi mengerjakan pesanan yang telah memenuhi syarat DP & desain, lalu menjalani pemeriksaan QC.',
            },
            {
              step: '04. Pelunasan & Kirim',
              desc: 'Pelunasan diverifikasi, nomor resi dicatat, dan pelanggan memantau pengiriman melalui halaman tracking.',
            },
          ].map((item) => (
            <div key={item.step} className="border-t-2 border-slate-200 pt-4">
              <div className="text-sm font-semibold text-slate-900">{item.step}</div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Tiers Section */}
      <section id="harga" className="bg-slate-50 border-t border-slate-200/80 py-16 px-6 sm:px-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Paket Langganan Transparan Sesuai Skala Produksi
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Mulai gratis untuk workshop rintisan, dan tingkatkan kapasitas seiring
              bertambahnya volume pesanan bulanan.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                name: 'FREE',
                audience: 'Untuk usaha rintisan mandiri',
                price: 'Rp0',
                period: '/bulan',
                orders: '20 pesanan / bulan',
                users: '1 pengguna internal',
              },
              {
                name: 'STARTER',
                audience: 'Untuk workshop berkembang',
                price: 'Rp69.000',
                period: '/bulan',
                orders: '150 pesanan / bulan',
                users: '3 pengguna internal',
                featured: true,
              },
              {
                name: 'BUSINESS',
                audience: 'Untuk pabrik & konveksi skala menengah',
                price: 'Rp149.000',
                period: '/bulan',
                orders: '500 pesanan / bulan',
                users: '10 pengguna internal',
              },
              {
                name: 'ENTERPRISE',
                audience: 'Untuk manufaktur multi-lini',
                price: 'Kustom',
                period: 'sesuai kesepakatan',
                orders: 'Kapasitas pesanan tak terbatas',
                users: 'Pengguna & SLA khusus',
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`bg-white rounded-xl p-6 flex flex-col justify-between border ${
                  tier.featured ? 'border-indigo-600' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{tier.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{tier.audience}</div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {tier.price}
                    </span>
                    <span className="text-xs text-slate-500">{tier.period}</span>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                    <div>{tier.orders}</div>
                    <div>{tier.users}</div>
                    <div>Kanban Produksi & Gate QC</div>
                    <div>Invoice PDF & Tracking Publik</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant={tier.featured ? 'primary' : 'secondary'}
                  className="mt-6 w-full"
                  onClick={() => navigate('/register')}
                >
                  Pilih Paket
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 px-6 sm:px-10 border-t border-slate-200 bg-white text-xs text-slate-500">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} OrderFlow — Sistem Manajemen Pesanan & Produksi Custom.</span>
          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-slate-900">
              Masuk
            </Link>
            <Link to="/register" className="hover:text-slate-900">
              Daftar Bisnis
            </Link>
            <Link to="/track" className="hover:text-slate-900">
              Lacak Pesanan
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const { firebaseUser, profile, loginWithGoogle, authError } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseUser && profile) {
      navigate(profile.effectiveRole === 'customer' ? '/portal' : '/dashboard', {
        replace: true,
      });
    }
  }, [firebaseUser, profile, navigate]);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      await loginWithGoogle();
      toast.success('Berhasil masuk ke OrderFlow.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Autentikasi dibatalkan atau gagal.';
      setLocalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="max-w-md w-full mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <span>OrderFlow</span>
          </Link>
          <Link to="/track" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            Lacak Pesanan →
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          {mode === 'forgot' ? (
            <>
              <h1 className="text-lg font-semibold text-slate-900">Pemulihan Akses Akun</h1>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Workspace OrderFlow menggunakan autentikasi terenkripsi Google OAuth melalui
                Firebase Authentication untuk keamanan sesi tingkat lanjut.
              </p>
              <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-2 leading-relaxed">
                <p>
                  1. Apabila Anda lupa kata sandi akun Google yang tertaut, lakukan pemulihan
                  langsung melalui halaman keamanan Google Account Anda.
                </p>
                <p>
                  2. Apabila Anda diundang sebagai Admin, Staf Produksi, atau Pelanggan, cukup
                  masuk menggunakan alamat email Google yang sama dengan undangan.
                </p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Link to="/login" className="text-xs font-medium text-indigo-600 hover:underline">
                  ← Kembali ke Halaman Masuk
                </Link>
                <Button type="button" size="sm" onClick={() => navigate('/login')}>
                  Masuk Sekarang
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900">
                {mode === 'register'
                  ? 'Buat Workspace Bisnis OrderFlow'
                  : 'Masuk ke Workspace OrderFlow'}
              </h1>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                {mode === 'register'
                  ? 'Setiap Owner baru otomatis mendapatkan workspace bisnis terisolasi beserta kuota awal.'
                  : 'Gunakan akun Google bisnis atau email tim yang telah diundang ke workspace.'}
              </p>

              {(localError || authError) && (
                <div className="mt-4">
                  <ErrorBanner message={localError || authError || 'Gagal masuk.'} />
                </div>
              )}

              <div className="mt-6 space-y-4">
                <Button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  className="w-full"
                >
                  <span>
                    {submitting
                      ? 'Menghubungkan Akun...'
                      : mode === 'register'
                      ? 'Daftar & Buat Workspace dengan Google'
                      : 'Lanjutkan dengan Akun Google'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs text-slate-600 space-y-1.5">
                  <div className="font-medium text-slate-800">Ketentuan Akses Otomatis:</div>
                  <div>
                    · Pendaftar baru otomatis ditetapkan sebagai <strong>Owner</strong> dengan
                    workspace baru.
                  </div>
                  <div>
                    · Email yang telah diundang otomatis terhubung sebagai{' '}
                    <strong>Admin, Staf Produksi,</strong> atau <strong>Pelanggan</strong>.
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
                {mode === 'login' ? (
                  <>
                    <Link to="/register" className="text-indigo-600 font-medium hover:underline">
                      Belum punya workspace? Daftar
                    </Link>
                    <Link to="/forgot-password" className="hover:text-slate-800">
                      Bantuan Akses
                    </Link>
                  </>
                ) : (
                  <Link to="/login" className="text-indigo-600 font-medium hover:underline">
                    Sudah punya akun? Masuk di sini
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface PublicTrackingResponse {
  requiresVerification: boolean;
  trackingToken?: string;
  orderNumberMasked?: string;
  businessName?: string;
  hint?: string;
  business?: { name: string; industry: string; phone: string };
  customerName?: string;
  order?: {
    orderNumber: string;
    trackingToken: string;
    title: string;
    category: string;
    specifications: string;
    orderStatus: string;
    designStatus: string;
    productionStatus: string;
    paymentStatus: string;
    grandTotal: number;
    paidAmount: number;
    remainingAmount: number;
    orderDate: string;
    deadline: string;
    isOverdue: boolean;
  };
  items?: Array<{
    id: string;
    productName: string;
    specifications: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
  }>;
  production?: {
    status: string;
    qcPassed: boolean;
    photos: Array<{ id: string; url: string; caption: string; uploadedAt: string }>;
  } | null;
  shipping?: {
    courierName: string;
    serviceType: string;
    trackingNumber: string;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  timeline?: Array<{
    id: string;
    domain: string;
    toStatus: string;
    reason: string;
    createdAt: string;
  }>;
}

const PRODUCTION_STEPS = [
  'menunggu_produksi',
  'persiapan',
  'dalam_produksi',
  'quality_control',
  'siap_dikirim',
  'selesai',
];

export function PublicTrackingPage() {
  const { token: routeToken } = useParams<{ token?: string }>();
  const navigate = useNavigate();

  const [tokenInput, setTokenInput] = useState(routeToken || '');
  const [pinInput, setPinInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicTrackingResponse | null>(null);

  const fetchTracking = async (targetToken: string, targetPin?: string) => {
    const clean = targetToken.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const qs = targetPin ? `?pin=${encodeURIComponent(targetPin.trim())}` : '';
      const res = await fetch(`/api/public/track/${encodeURIComponent(clean)}${qs}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Kode tracking tidak ditemukan.');
      }
      setData(json);
    } catch (err: unknown) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Gagal memuat status pesanan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (routeToken) {
      setTokenInput(routeToken.toUpperCase());
      void fetchTracking(routeToken);
    }
  }, [routeToken]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tokenInput.trim().toUpperCase();
    if (!clean) {
      toast.error('Masukkan kode tracking pesanan.');
      return;
    }
    navigate(`/track/${encodeURIComponent(clean)}`);
    void fetchTracking(clean, pinInput);
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) {
      toast.error('Masukkan 4 digit PIN verifikasi.');
      return;
    }
    void fetchTracking(tokenInput, pinInput);
  };

  const currentProdIndex = data?.order
    ? PRODUCTION_STEPS.indexOf(data.order.productionStatus)
    : -1;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <span>OrderFlow Tracking</span>
          </Link>
          <Link to="/login" className="text-xs font-medium text-slate-600 hover:text-slate-900">
            Login Workspace →
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Search Tracking Form */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-slate-900">Lacak Status Pesanan Custom</h1>
          <p className="mt-1 text-xs text-slate-500">
            Masukkan kode tracking resmi yang tertera pada bukti pesanan atau invoice Anda.
          </p>

          <form onSubmit={handleLookup} className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Masukkan kode tracking (mis. TRK-TS26-...)"
              className="flex-1 h-10 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <Button type="submit" disabled={loading}>
              <Search className="w-4 h-4" />
              <span>{loading ? 'Mencari...' : 'Cari Pesanan'}</span>
            </Button>
          </form>
        </div>

        {error && <ErrorBanner message={error} />}

        {/* PIN Verification Gate */}
        {data?.requiresVerification && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg mx-auto">
            <div className="flex items-center gap-2.5 text-slate-900 font-semibold text-sm">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>Verifikasi Keamanan Pelanggan</span>
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Pesanan <strong className="font-mono">{data.orderNumberMasked}</strong> dari{' '}
              <strong>{data.businessName}</strong> ditemukan. {data.hint}
            </p>
            <form onSubmit={handleVerifyPin} className="mt-4 flex items-center gap-3">
              <input
                type="text"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="4 digit akhir No. HP"
                className="w-44 h-10 px-3.5 text-sm font-mono tracking-widest bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <Button type="submit" disabled={loading}>
                Buka Detail
              </Button>
            </form>
          </div>
        )}

        {/* Verified Order Tracking Detail */}
        {data && !data.requiresVerification && data.order && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200/80">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>{data.order.orderNumber}</span>
                    <span>·</span>
                    <span>{data.business?.name}</span>
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">
                    {data.order.title}
                  </h2>
                  <div className="mt-1 text-xs text-slate-500">
                    Pemesan: <strong className="text-slate-700">{data.customerName}</strong> ·
                    Kategori: {data.order.category}
                  </div>
                </div>
                <div className="flex flex-col sm:items-end gap-1.5">
                  <StatusIndicator
                    status={data.order.isOverdue ? 'terlambat' : data.order.orderStatus}
                    label={
                      data.order.isOverdue
                        ? 'Melewati Estimasi Deadline'
                        : ORDER_STATUS_LABELS[data.order.orderStatus] || data.order.orderStatus
                    }
                  />
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    Target Selesai: {formatDateId(data.order.deadline)}
                  </div>
                </div>
              </div>

              {/* 6-Stage Production Progress */}
              <div className="py-6 border-b border-slate-200/80">
                <div className="text-xs font-semibold text-slate-900 mb-4">
                  Tahapan Produksi Saat Ini
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  {PRODUCTION_STEPS.map((step, idx) => {
                    const done = idx <= currentProdIndex;
                    return (
                      <div
                        key={step}
                        className={`p-3 rounded-lg border text-xs ${
                          done
                            ? 'bg-indigo-50/50 border-indigo-200 text-slate-900'
                            : 'bg-slate-50 border-slate-200/70 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[11px]">0{idx + 1}</span>
                          {done && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                        </div>
                        <div className="font-medium leading-snug">
                          {PRODUCTION_STATUS_LABELS[step]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payment, Design & Shipping Summary */}
              <div className="pt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-xs text-slate-500">Status Desain</div>
                  <div className="mt-1">
                    <StatusIndicator
                      status={data.order.designStatus}
                      label={DESIGN_STATUS_LABELS[data.order.designStatus] || data.order.designStatus}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Status Pembayaran</div>
                  <div className="mt-1">
                    <StatusIndicator
                      status={data.order.paymentStatus}
                      label={
                        PAYMENT_STATUS_LABELS[data.order.paymentStatus] ||
                        data.order.paymentStatus
                      }
                    />
                  </div>
                  <div className="mt-1 text-xs font-mono tabular-nums text-slate-600">
                    Terbayar {formatRupiah(data.order.paidAmount)} dari{' '}
                    {formatRupiah(data.order.grandTotal)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">Pengiriman</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-900">
                    <Truck className="w-3.5 h-3.5 text-slate-500" />
                    <span>{data.shipping?.courierName || 'Ambil di Workshop'}</span>
                  </div>
                  {data.shipping?.trackingNumber && (
                    <div className="mt-1 text-xs font-mono text-indigo-600">
                      Resi: {data.shipping.trackingNumber}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Order Items & Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">
                  Rincian Produk Dipesan
                </h3>
                <div className="divide-y divide-slate-100">
                  {data.items?.map((item) => (
                    <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {item.productName}
                        </div>
                        {item.specifications && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {item.specifications}
                          </div>
                        )}
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-xs font-semibold text-slate-900">
                          {item.quantity} {item.unit}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatRupiah(item.lineTotal)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">
                  Riwayat Perubahan Status
                </h3>
                {data.timeline && data.timeline.length > 0 ? (
                  <div className="space-y-3.5">
                    {data.timeline.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 text-xs">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-slate-900">
                            [{log.domain.toUpperCase()}] {log.toStatus.replace(/_/g, ' ')}
                          </div>
                          {log.reason && <div className="text-slate-500">{log.reason}</div>}
                          <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                            {formatDateTimeId(log.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Belum ada riwayat pembaruan.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
