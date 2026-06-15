import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Search, SlidersHorizontal, ChevronLeft, ChevronRight,
  Users, DollarSign, Calendar, RefreshCw, AlertCircle,
  Loader2, TrendingUp, X, ArrowUpDown, ShieldCheck
} from 'lucide-react';

const API_BASE_URL = 'https://xeno-crm-zcs5.onrender.com';

// RFM Segments from backend RFM engine
const SEGMENTS = [
  'Champions',
  'Loyal Customers',
  'Recent / New Customers',
  'High-value At Risk',
  'Need Attention',
  'About to Sleep',
  'Hibernating / Lapsed',
];

// Segment visual config
const SEGMENT_CONFIG = {
  'Champions': { color: 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300', dot: 'bg-emerald-400' },
  'Loyal Customers': { color: 'bg-blue-950/50 border-blue-700/60 text-blue-300', dot: 'bg-blue-400' },
  'Recent / New Customers': { color: 'bg-sky-950/50 border-sky-700/60 text-sky-300', dot: 'bg-sky-400' },
  'High-value At Risk': { color: 'bg-amber-950/50 border-amber-700/60 text-amber-300', dot: 'bg-amber-400' },
  'Need Attention': { color: 'bg-purple-950/50 border-purple-700/60 text-purple-300', dot: 'bg-purple-400' },
  'About to Sleep': { color: 'bg-orange-950/50 border-orange-700/60 text-orange-300', dot: 'bg-orange-400' },
  'Hibernating / Lapsed': { color: 'bg-zinc-900/60 border-zinc-700/60 text-zinc-400', dot: 'bg-zinc-500' },
};

function getSegmentConfig(segment) {
  return SEGMENT_CONFIG[segment] || SEGMENT_CONFIG['Hibernating / Lapsed'];
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val ?? 0);
}

function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function RFMBadge({ r, f, m, composite }) {
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      <span
        title="Recency Score"
        className="bg-red-950/60 border border-red-900/60 text-red-300 text-[11px] font-bold px-1.5 py-0.5 rounded"
      >
        R{r}
      </span>
      <span
        title="Frequency Score"
        className="bg-blue-950/60 border border-blue-900/60 text-blue-300 text-[11px] font-bold px-1.5 py-0.5 rounded"
      >
        F{f}
      </span>
      <span
        title="Monetary Score"
        className="bg-emerald-950/60 border border-emerald-900/60 text-emerald-300 text-[11px] font-bold px-1.5 py-0.5 rounded"
      >
        M{m}
      </span>
      <span
        title="Composite RFM Score"
        className="ml-0.5 text-zinc-400 font-semibold text-[11px]"
      >
        ({composite})
      </span>
    </div>
  );
}


// Render modals at top-level of page
function CustomerExplorerWithModals(props) {
  const ref = React.createRef();
  return (
    <>
      <CustomerExplorer {...props} />
      {/* The modal components are controlled via window events and component state inside CustomerExplorer */}
    </>
  );
}

// ─── Stat mini-card ──────────────────────────────────────────────────────────
function StatCard({ icon: Icon, iconClass, label, value }) {
  return (
    <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/50 rounded-xl px-4 py-2.5 min-w-[160px]">
      <div className={`p-1.5 rounded-lg ${iconClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</p>
        <p className="text-sm font-extrabold text-zinc-100">{value}</p>
      </div>
    </div>
  );
}

// ─── Table skeleton row ───────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/40">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="py-4 px-6">
          <div className="h-3.5 bg-zinc-800/80 rounded-full animate-pulse w-3/4" />
          {i === 1 && <div className="h-2.5 bg-zinc-800/50 rounded-full animate-pulse w-1/2 mt-2" />}
        </td>
      ))}
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CustomerExplorer(props) {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const limit = 15;
  const [search, setSearch] = useState('');
  const [liveSearch, setLiveSearch] = useState('');  // debounced copy
  const [selectedSegment, setSelectedSegment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const debounceTimer = useRef(null);

  // ── Fetch stats (once) ──
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/customers/stats`)
      .then((r) => setStats(r.data))
      .catch(() => { });
  }, []);

  // ── Core fetch ──
  const fetchCustomers = useCallback(async (overrides = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: overrides.page ?? page,
        limit,
        search: (overrides.search ?? liveSearch).trim() || undefined,
        tier: (overrides.tier ?? selectedSegment) || undefined,
      };
      const { data } = await axios.get(`${API_BASE_URL}/api/customers/`, { params });
      setCustomers(data.customers);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      setError('Failed to fetch customer data. Make sure the backend is running on port 8000.');
    } finally {
      setLoading(false);
    }
  }, [page, liveSearch, selectedSegment]);

  // Trigger on page / segment change
  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedSegment, liveSearch]);

  // ── Debounce search input ──
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setPage(1);
      setLiveSearch(val);
    }, 420);
  };

  const clearSearch = () => {
    setSearch('');
    setLiveSearch('');
    setPage(1);
  };

  const handleReset = () => {
    clearTimeout(debounceTimer.current);
    setSearch('');
    setLiveSearch('');
    setSelectedSegment('');
    setPage(1);
  };

  // ── Pagination helpers ──
  const pageNumbers = () => {
    const maxBtns = 5;
    let start = Math.max(1, page - 2);
    let end = Math.min(pages, start + maxBtns - 1);
    if (end - start + 1 < maxBtns) start = Math.max(1, end - maxBtns + 1);
    const nums = [];
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  };

  const isFiltered = search.trim() || selectedSegment;

  // ── CRUD Handlers ──
  const openAdd = () => { setShowAddModal(true); };
  const openEdit = (customer) => { setEditingCustomer(customer); setShowEditModal(true); };
  const openDelete = (customer) => { setDeletingCustomer(customer); setShowDeleteConfirm(true); };

  // CSV Upload UI state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadReport, setUploadReport] = useState(null);

  const handleCreate = async (payload) => {
    try {
      await axios.post(`${API_BASE_URL}/api/customers/`, payload);
      setShowAddModal(false);
      fetchCustomers({ page: 1 });
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to create customer');
    }
  };

  const handleUpdate = async (id, payload) => {
    try {
      await axios.put(`${API_BASE_URL}/api/customers/${id}`, payload);
      setShowEditModal(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to update customer');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/customers/${id}`);
      setShowDeleteConfirm(false);
      setDeletingCustomer(null);
      fetchCustomers({ page: 1 });
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete customer');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:px-8 space-y-6">

      {/* ── Page Header ─────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-5 pb-6 border-b border-zinc-900">
        <div>
          <span className="text-xs uppercase tracking-widest text-coffee-400 font-bold block mb-1">
            Customer Intelligence
          </span>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-zinc-50 via-coffee-300 to-coffee-500 bg-clip-text text-transparent">
            Customer Explorer
          </h1>
          <p className="text-zinc-500 text-sm font-medium mt-1.5">
            Browse, search, and filter your entire customer base with live RFM insights.
          </p>
        </div>

        {/* Summary stat pills */}
        {stats && (
          <div className="flex flex-wrap gap-3">
            <StatCard
              icon={Users}
              iconClass="bg-coffee-950 text-coffee-400"
              label="Total Customers"
              value={stats.total.toLocaleString('en-IN')}
            />
            <StatCard
              icon={DollarSign}
              iconClass="bg-emerald-950 text-emerald-400"
              label="Total Revenue"
              value={formatCurrency(stats.total_revenue)}
            />
            <StatCard
              icon={TrendingUp}
              iconClass="bg-blue-950 text-blue-400"
              label="Avg. Spend"
              value={formatCurrency(stats.avg_spend)}
            />
            <button
              onClick={openAdd}
              className="ml-2 bg-coffee-700 hover:bg-coffee-600 text-white font-bold text-sm px-3 py-2 rounded-xl"
            >
              + Add Customer
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="ml-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm px-3 py-2 rounded-xl"
            >
              Upload CSV
            </button>
          </div>
        )}
      </header>

      {/* ── Search & Filter Bar ──────────────────────────────── */}
      <section className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 md:p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">

          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              id="customer-search"
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={handleSearchChange}
              className="w-full bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 focus:border-coffee-500/70 text-zinc-100 placeholder-zinc-600 rounded-xl pl-10 pr-10 py-2.5 outline-none transition-all text-sm font-medium"
            />
            {search && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Segment Dropdown */}
          <div className="relative w-full md:w-60">
            <SlidersHorizontal className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <select
              id="segment-filter"
              value={selectedSegment}
              onChange={(e) => { setSelectedSegment(e.target.value); setPage(1); }}
              className="w-full bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 focus:border-coffee-500/70 text-zinc-100 rounded-xl pl-10 pr-8 py-2.5 outline-none transition-all text-sm font-medium appearance-none cursor-pointer"
            >
              <option value="">All Segments</option>
              {SEGMENTS.map((seg) => (
                <option key={seg} value={seg}>{seg}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 text-[10px]">▼</div>
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            title="Reset all filters"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${isFiltered
                ? 'bg-coffee-800/20 border-coffee-800/50 text-coffee-300 hover:bg-coffee-800/40'
                : 'bg-zinc-950/80 border-zinc-800/80 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Active filter chips */}
        {isFiltered && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-800/50">
            <span className="text-[10px] text-zinc-600 uppercase font-bold self-center">Active filters:</span>
            {search.trim() && (
              <span className="flex items-center gap-1.5 bg-coffee-950/50 border border-coffee-800/50 text-coffee-300 text-xs font-semibold px-2.5 py-1 rounded-full">
                <Search className="w-3 h-3" />
                "{search.trim()}"
                <button onClick={clearSearch} className="hover:text-white ml-0.5"><X className="w-2.5 h-2.5" /></button>
              </span>
            )}
            {selectedSegment && (
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${getSegmentConfig(selectedSegment).color}`}>
                <ShieldCheck className="w-3 h-3" />
                {selectedSegment}
                <button onClick={() => { setSelectedSegment(''); setPage(1); }} className="hover:text-white ml-0.5"><X className="w-2.5 h-2.5" /></button>
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Data Table ──────────────────────────────────────── */}
      <section className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">

        {/* Table header meta */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-800/60 bg-zinc-900/20">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              Sorted by RFM Score · Highest First
            </span>
          </div>
          {!loading && (
            <span className="text-xs font-bold text-zinc-500">
              {total.toLocaleString('en-IN')} result{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* States: loading / error / empty / table */}
        {loading ? (
          <div>
            <table className="w-full text-left border-collapse">
              <thead>
                <TableHead />
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-red-950/40 border border-red-900/50 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-zinc-200 font-bold mb-1">Could Not Load Customers</h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">{error}</p>
            <button
              onClick={() => fetchCustomers()}
              className="mt-5 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-zinc-600" />
            </div>
            <h3 className="text-zinc-300 font-bold mb-1">No Customers Found</h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              No customers match the current filters. Try adjusting your search or segment.
            </p>
            <button
              onClick={handleReset}
              className="mt-5 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <TableHead />
              </thead>
              <tbody className="divide-y divide-zinc-800/40 text-sm text-zinc-300">
                {customers.map((c, idx) => (
                    <CustomerRow
                      key={c.id}
                      c={c}
                      rank={(page - 1) * limit + idx + 1}
                      onEdit={() => openEdit(c)}
                      onDelete={() => openDelete(c)}
                      onOpenCustomer360={(id) => props && props.onOpenCustomer360 ? props.onOpenCustomer360(id) : null}
                    />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && !error && customers.length > 0 && (
          <footer className="px-6 py-4 bg-zinc-900/30 border-t border-zinc-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs font-semibold text-zinc-500">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of{' '}
              <span className="text-zinc-300">{total.toLocaleString('en-IN')}</span> profiles
            </span>

            <div className="flex items-center gap-1">
              <PaginationBtn
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                icon={<ChevronLeft className="w-4 h-4" />}
              />
              {pageNumbers().map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${page === p
                      ? 'bg-coffee-800 border-coffee-700 text-white shadow-md shadow-coffee-950/30'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
                    }`}
                >
                  {p}
                </button>
              ))}
              <PaginationBtn
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                icon={<ChevronRight className="w-4 h-4" />}
              />
            </div>
          </footer>
        )}
      </section>
      {/* Modals */}
      <CustomerFormModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreate}
      />

      <CustomerFormModal
        visible={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingCustomer(null); }}
        onSubmit={(payload) => handleUpdate(editingCustomer.id, payload)}
        initial={editingCustomer || {}}
      />

      <DeleteConfirm
        visible={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeletingCustomer(null); }}
        onConfirm={handleDelete}
        customer={deletingCustomer}
      />

      {/* Upload CSV Modal */}
      {showUploadModal && (
        <CSVUploadModal
          visible={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onResult={(report) => { setUploadReport(report); setShowUploadModal(false); fetchCustomers({ page: 1 }); }}
        />
      )}

      {/* Upload report modal */}
      {uploadReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setUploadReport(null)} />
          <div className="relative bg-zinc-900 rounded-xl p-6 w-full max-w-xl z-10 text-zinc-100">
            <h3 className="text-lg font-bold mb-3">Import Report</h3>
            <p className="text-sm text-zinc-400 mb-4">Created: {uploadReport.created_count}, Skipped: {uploadReport.skipped_count}, Errors: {uploadReport.errors_count}</p>
            <div className="max-h-64 overflow-y-auto text-sm bg-zinc-950/30 p-3 rounded">
              <pre className="whitespace-pre-wrap">{JSON.stringify(uploadReport, null, 2)}</pre>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setUploadReport(null)} className="px-3 py-2 rounded bg-coffee-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Table header ─────────────────────────────────────────────────────────────
function TableHead() {
  return (
    <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
      <th className="py-3.5 px-6 w-8 text-center">#</th>
      <th className="py-3.5 px-6">Customer</th>
      <th className="py-3.5 px-6">Segment</th>
      <th className="py-3.5 px-6 text-center">RFM Score</th>
      <th className="py-3.5 px-6 text-right">Total Spend</th>
      <th className="py-3.5 px-6">Last Order</th>
    </tr>
  );
}

// ─── Customer row ─────────────────────────────────────────────────────────────
function CustomerRow({ c, rank, onEdit, onDelete, onOpenCustomer360 }) {
  const seg = getSegmentConfig(c.rfm_tier);

  return (
    <tr className="hover:bg-zinc-800/20 transition-colors duration-150 group">
      {/* Rank */}
      <td className="py-4 px-6 text-center text-xs text-zinc-600 font-bold tabular-nums">
        {rank}
      </td>

      {/* Name + Email */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-3">
          {/* Avatar initials */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-coffee-700 to-coffee-900 border border-coffee-800/40 flex items-center justify-center shrink-0 text-[11px] font-black text-coffee-200 select-none">
            {c.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p onClick={() => onOpenCustomer360 && onOpenCustomer360(c.id)} className="font-bold cursor-pointer text-zinc-100 group-hover:text-coffee-300 transition-colors leading-tight">
              {c.name}
            </p>
            <p className="text-xs text-zinc-500 font-medium mt-0.5 leading-tight">
              {c.email}
            </p>
          </div>
        </div>
      </td>

      {/* Segment badge */}
      <td className="py-4 px-6">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border tracking-wide ${seg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${seg.dot} shrink-0`} />
          {c.rfm_tier || 'Unassigned'}
        </span>
      </td>

      {/* RFM Score */}
      <td className="py-4 px-6">
        <RFMBadge
          r={c.recency_score}
          f={c.frequency_score}
          m={c.monetary_score}
          composite={c.rfm_score}
        />
      </td>

      {/* Total Spend */}
      <td className="py-4 px-6 text-right">
        <span className="font-extrabold text-emerald-400 tabular-nums">
          {formatCurrency(c.total_spend)}
        </span>
        <span className="block text-[11px] text-zinc-600 font-medium mt-0.5">
          {c.total_orders} order{c.total_orders !== 1 ? 's' : ''}
        </span>
      </td>

      {/* Last Order Date */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
          <Calendar className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          {formatDate(c.last_purchase_date)}
        </div>
        {c.days_since_purchase != null && (
          <p className="text-[11px] text-zinc-600 font-medium mt-0.5 pl-5">
            {c.days_since_purchase === 0 ? 'Today' : `${c.days_since_purchase}d ago`}
          </p>
        )}
        {/* Actions */}
        <div className="mt-2 flex gap-2">
          <button onClick={() => onEdit && onEdit(c)} className="text-xs font-semibold px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Edit</button>
          <button onClick={() => onDelete && onDelete(c)} className="text-xs font-semibold px-2 py-1 rounded bg-red-800 hover:bg-red-700">Delete</button>
        </div>
      </td>
    </tr>
  );
}


// ─── Add / Edit Modals and Delete Confirm ───────────────────────────────────
function CustomerFormModal({ visible, onClose, onSubmit, initial = {} }) {
  const [name, setName] = useState(initial.name || '');
  const [email, setEmail] = useState(initial.email || '');
  const [phone, setPhone] = useState(initial.phone || '');
  const [city, setCity] = useState(initial.city || '');
  const [channel, setChannel] = useState(initial.channel_preference || 'whatsapp');
  const [segment, setSegment] = useState(initial.rfm_tier || '');

  useEffect(() => {
  if (!visible) return;

  setName(initial.name || '');
  setEmail(initial.email || '');
  setPhone(initial.phone || '');
  setCity(initial.city || '');
  setChannel(initial.channel_preference || 'whatsapp');
  setSegment(initial.rfm_tier || '');
}, [visible, initial.id]);

  if (!visible) return null;

  const submit = () => {
    if (!name.trim()) return alert('Name is required');
    if (!email.trim() || !email.includes('@')) return alert('Valid email is required');
    onSubmit({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, city: city.trim() || undefined, channel_preference: channel, segment: segment || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 rounded-xl p-6 w-full max-w-md z-10">
        <h3 className="text-lg font-bold mb-3">{initial.id ? 'Edit Customer' : 'Add Customer'}</h3>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full p-2 rounded bg-zinc-800" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full p-2 rounded bg-zinc-800" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full p-2 rounded bg-zinc-800" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full p-2 rounded bg-zinc-800" />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full p-2 rounded bg-zinc-800">
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className="w-full p-2 rounded bg-zinc-800">
            <option value="">Assign Segment (optional)</option>
            {SEGMENTS.map((seg) => (
              <option key={seg} value={seg}>{seg}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-zinc-800">Cancel</button>
          <button onClick={submit} className="px-3 py-2 rounded bg-coffee-700 text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ visible, onClose, onConfirm, customer }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 rounded-xl p-6 w-full max-w-sm z-10">
        <h3 className="text-lg font-bold mb-3">Delete Customer</h3>
        <p>Are you sure you want to delete <strong>{customer?.name}</strong>? This action cannot be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-zinc-800">Cancel</button>
          <button onClick={() => onConfirm(customer.id)} className="px-3 py-2 rounded bg-red-700 text-white">Delete</button>
        </div>
      </div>
    </div>
  );
}



// ─── Pagination button ────────────────────────────────────────────────────────
function PaginationBtn({ onClick, disabled, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 border border-zinc-800 rounded-xl bg-zinc-950 hover:bg-zinc-800/60 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-100 transition-all"
    >
      {icon}
    </button>
  );
}


// CSV Upload Modal component
function CSVUploadModal({ visible, onClose, onResult }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = React.createRef();

  if (!visible) return null;

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const upload = async () => {
    if (!file) return alert('Please select a CSV file first');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_BASE_URL}/api/customers/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onResult(res.data);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Upload failed. Ensure the backend is running.';
      alert(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 rounded-xl p-6 w-full max-w-lg z-10 text-zinc-100">
        <h3 className="text-lg font-bold mb-3">Upload Customers CSV</h3>
        <p className="text-sm text-zinc-400 mb-4">CSV format: <code>name,email,phone,city</code></p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`w-full border-2 rounded-xl p-6 mb-4 ${dragOver ? 'border-amber-500 bg-zinc-900/30' : 'border-zinc-800'}`}
        >
          <input ref={inputRef} type="file" accept=".csv" onChange={onFileChange} className="hidden" />
          <div className="flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-zinc-400">Drag & drop a CSV file here, or</p>
            <button onClick={() => inputRef.current && inputRef.current.click()} className="px-3 py-2 rounded bg-coffee-700">Choose File</button>
            {file && <p className="text-xs text-zinc-300 mt-2">Selected: {file.name}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-zinc-800">Cancel</button>
          <button onClick={upload} disabled={uploading} className="px-3 py-2 rounded bg-amber-600 text-black font-semibold">{uploading ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
    </div>
  );
}
