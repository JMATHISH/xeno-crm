import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Rocket, Plus, Target, DollarSign, Calendar, Activity,
  CheckCircle2, PlayCircle, Clock, RefreshCw, AlertCircle,
  ChevronRight, X, Sparkles, TrendingUp, Users, Loader2,
  ArrowRight, Zap
} from 'lucide-react';

const API_BASE_URL = 'https://xeno-crm-zcs5.onrender.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(val) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val ?? 0);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function getStatusConfig(status) {
  switch (status?.toLowerCase()) {
    case 'completed':
      return {
        label: 'Completed',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        pill: 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300',
        dot:  'bg-emerald-400',
        glow: 'shadow-emerald-950/40',
      };
    case 'running':
      return {
        label: 'Running',
        icon: <Activity className="w-3.5 h-3.5 animate-pulse" />,
        pill: 'bg-amber-950/50 border-amber-700/50 text-amber-300',
        dot:  'bg-amber-400 animate-ping',
        glow: 'shadow-amber-950/40',
      };
    case 'draft':
      return {
        label: 'Draft',
        icon: <Clock className="w-3.5 h-3.5" />,
        pill: 'bg-zinc-900/60 border-zinc-700/60 text-zinc-400',
        dot:  'bg-zinc-500',
        glow: '',
      };
    default:
      return {
        label: status ?? 'Pending',
        icon: <PlayCircle className="w-3.5 h-3.5" />,
        pill: 'bg-blue-950/50 border-blue-700/50 text-blue-300',
        dot:  'bg-blue-400',
        glow: '',
      };
  }
}

// ─── Launch Campaign Modal ────────────────────────────────────────────────────
function LaunchModal({ onClose, onSuccess }) {
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(''); // 'planning' | 'launching' | ''
  const [error, setError] = useState('');

  const GOAL_PRESETS = [
    'Win back lapsed customers with a loyalty offer',
    'Upsell premium blends to Loyal Customers',
    'Re-engage At Risk customers before they churn',
    'Activate new customers with a welcome discount',
    'Drive repeat purchases for Champions',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!goal.trim()) { setError('Please enter a campaign goal.'); return; }
    setLoading(true);
    setError('');
    try {
      // Phase 1: AI plans the campaign and persists steps
      setPhase('planning');
      const planRes = await axios.post(`${API_BASE_URL}/api/agent/run`, { goal: goal.trim() });
      const campaignId = planRes.data.id;

      // Phase 2: Kick off autonomous execution (returns 202 immediately)
      setPhase('launching');
      await axios.post(`${API_BASE_URL}/api/agent/launch_campaign/${campaignId}`);

      // Navigate to Mission Control for this campaign
      onSuccess(campaignId);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        'Failed to launch campaign. Make sure the backend is running.'
      );
    } finally {
      setLoading(false);
      setPhase('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-gradient-to-r from-zinc-900 to-coffee-950/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-coffee-900/50 border border-coffee-800/50 rounded-xl">
              <Rocket className="w-5 h-5 text-coffee-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-zinc-100">Launch New Campaign</h2>
              <p className="text-xs text-zinc-500 font-medium">AI will build a multi-step strategy around your goal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Goal textarea */}
          <div>
            <label className="text-xs uppercase tracking-widest font-bold text-zinc-500 block mb-2">
              Campaign Goal
            </label>
            <textarea
              id="campaign-goal-input"
              rows={3}
              value={goal}
              onChange={(e) => { setGoal(e.target.value); setError(''); }}
              placeholder="e.g. Win back lapsed customers with a personalised discount offer…"
              className="w-full bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 focus:border-coffee-600/60 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-3 outline-none transition-all text-sm font-medium resize-none"
            />
            {error && (
              <p className="mt-2 text-xs text-red-400 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </p>
            )}
          </div>

          {/* Quick-fill presets */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 mb-2.5">
              Quick-fill presets
            </p>
            <div className="flex flex-wrap gap-2">
              {GOAL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setGoal(preset)}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-coffee-800/70 hover:text-coffee-300 hover:bg-coffee-950/30 transition-all"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2.5 bg-coffee-950/20 border border-coffee-900/40 rounded-xl p-3.5">
            <Sparkles className="w-4 h-4 text-coffee-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              The Gemini AI agent will analyse your RFM segments, craft a personalised multi-step 
              outreach plan, and begin execution automatically.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 font-semibold text-sm transition-all"
            >
              Cancel
            </button>
            <button
              id="launch-campaign-submit"
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-coffee-600 to-coffee-800 hover:from-coffee-500 hover:to-coffee-700 text-white font-bold text-sm transition-all shadow-lg shadow-coffee-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {phase === 'planning' ? 'Planning with AI…' : 'Starting execution…'}
                </>
              ) : (
                <><Rocket className="w-4 h-4" /> Launch Campaign</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function CampaignEditModal({ visible, campaign, onClose, onSave }) {
  const [name, setName] = useState(campaign?.name || '');
  const [goal, setGoal] = useState(campaign?.goal || '');
  const [goalAmount, setGoalAmount] = useState(campaign?.goal_amount || 0);

  useEffect(() => {
    setName(campaign?.name || '');
    setGoal(campaign?.goal || '');
    setGoalAmount(campaign?.goal_amount || 0);
  }, [campaign]);

  if (!visible) return null;

  const save = () => {
    if (!name.trim()) return alert('Name is required');
    if (!goal.trim()) return alert('Goal is required');
    onSave(campaign.id, { name: name.trim(), goal: goal.trim(), goal_amount: Number(goalAmount) || 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold mb-3">Edit Campaign</h3>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 rounded bg-zinc-800" />
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className="w-full p-2 rounded bg-zinc-800" />
          <input value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} type="number" className="w-full p-2 rounded bg-zinc-800" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-zinc-800">Cancel</button>
          <button onClick={save} className="px-3 py-2 rounded bg-coffee-700 text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Prediction Modal ───────────────────────────────────────────────────────
function PredictionModal({ visible, onClose, prediction, loading }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Campaign Prediction</h3>
            <p className="text-xs text-zinc-500 mt-1">Estimated revenue, conversions and success probability based on historical data.</p>
          </div>
          <div className="text-sm text-zinc-400">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}</div>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-zinc-500">Computing prediction…</div>
          ) : prediction ? (
            prediction.error ? (
              <div className="py-8 text-center text-red-400">{prediction.error}</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800">
                    <p className="text-xs text-zinc-400">Predicted Revenue</p>
                    <p className="text-xl font-extrabold text-emerald-400 mt-1">{formatCurrency(prediction.predicted_revenue)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800">
                    <p className="text-xs text-zinc-400">Predicted Conversions</p>
                    <p className="text-xl font-extrabold text-zinc-200 mt-1">{prediction.predicted_conversions}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800">
                    <p className="text-xs text-zinc-400">Success Probability</p>
                    <p className="text-xl font-extrabold text-coffee-400 mt-1">{prediction.success_probability}%</p>
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className="text-sm font-bold text-zinc-200 mb-2">Step Predictions</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-zinc-300 border-collapse">
                      <thead>
                        <tr className="text-xs text-zinc-500 uppercase font-bold">
                          <th className="py-2 px-3">Step ID</th>
                          <th className="py-2 px-3">Reach</th>
                          <th className="py-2 px-3">Pred. Conversions</th>
                          <th className="py-2 px-3">Pred. Revenue</th>
                          <th className="py-2 px-3">Channel Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prediction.step_predictions.map((s) => (
                          <tr key={s.step_id} className="border-t border-zinc-800">
                            <td className="py-2 px-3">{s.step_id}</td>
                            <td className="py-2 px-3">{s.reach}</td>
                            <td className="py-2 px-3">{s.predicted_conversions}</td>
                            <td className="py-2 px-3">{formatCurrency(s.predicted_revenue)}</td>
                            <td className="py-2 px-3">{(s.channel_rate * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-bold text-zinc-200 mb-2">Explanation</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950/30 p-3 rounded-md overflow-auto">{JSON.stringify(prediction.explanation, null, 2)}</pre>
                </div>
              </>
            )
          ) : (
            <div className="py-8 text-center text-zinc-500">No prediction available.</div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-zinc-800 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/40">
      {[180, 100, 80, 90, 80].map((w, i) => (
        <td key={i} className="py-4 px-6">
          <div className={`h-3.5 bg-zinc-800/80 rounded-full animate-pulse`} style={{ width: w }} />
          {i === 0 && <div className="h-2.5 bg-zinc-800/50 rounded-full animate-pulse w-32 mt-2" />}
        </td>
      ))}
      <td className="py-4 px-6">
        <div className="h-7 w-7 bg-zinc-800/60 rounded-lg animate-pulse ml-auto" />
      </td>
    </tr>
  );
}

// ─── Campaign Row ─────────────────────────────────────────────────────────────
function CampaignRow({ campaign, onOpen }) {
  const status = getStatusConfig(campaign.status);
  const progress = campaign.goal_amount
    ? Math.min(Math.round((campaign.revenue_recovered / campaign.goal_amount) * 100), 100)
    : 0;

  return (
    <tr
      onClick={() => onOpen(campaign.id)}
      className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors duration-150 cursor-pointer group"
    >
      {/* Campaign Name + Step count */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-coffee-800 to-coffee-950 border border-coffee-800/40 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-coffee-300" />
          </div>
          <div>
            <p className="font-bold text-zinc-100 group-hover:text-coffee-300 transition-colors text-sm leading-tight">
              {campaign.name}
            </p>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
              {campaign.step_count} step{campaign.step_count !== 1 ? 's' : ''} · {campaign.total_customers_reached} reached
            </p>
          </div>
        </div>
      </td>

      {/* Goal */}
      <td className="py-4 px-6 max-w-[240px]">
        <p className="text-sm text-zinc-300 font-medium line-clamp-2 leading-snug">
          {campaign.goal}
        </p>
      </td>

      {/* Status */}
      <td className="py-4 px-6">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${status.pill}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot} shrink-0`} />
          {status.label}
        </span>
      </td>

      {/* Revenue Recovered */}
      <td className="py-4 px-6">
        <span className="text-sm font-extrabold text-emerald-400 tabular-nums">
          {formatCurrency(campaign.revenue_recovered)}
        </span>
        {campaign.goal_amount > 0 && (
          <div className="mt-1.5 w-24">
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-0.5 font-semibold">{progress}% of goal</p>
          </div>
        )}
      </td>

      {/* Created Date */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-1.5 text-zinc-400 text-sm font-medium">
          <Calendar className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          {formatDate(campaign.created_at)}
        </div>
      </td>

      {/* Actions */}
      <td className="py-4 px-6 text-right">
        <div className="flex items-center justify-end gap-2">
          <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('editCampaign', { detail: campaign })); }} className="text-xs font-semibold px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Edit</button>
          <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('cloneCampaign', { detail: campaign })); }} className="text-xs font-semibold px-2 py-1 rounded bg-sky-800 hover:bg-sky-700">Clone</button>
          <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('archiveCampaign', { detail: campaign })); }} className="text-xs font-semibold px-2 py-1 rounded bg-amber-800 hover:bg-amber-700">Archive</button>
          <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('deleteCampaign', { detail: campaign })); }} className="text-xs font-semibold px-2 py-1 rounded bg-red-800 hover:bg-red-700">Delete</button>
          <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('predictCampaign', { detail: campaign })); }} className="text-xs font-semibold px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600">Predict</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CampaignsPage({ onOpenMissionControl }) {
  const [campaigns, setCampaigns]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    const e1 = (ev) => { setEditing(ev.detail); setShowEditModal(true); };
    const e2 = (ev) => { handleClone(ev.detail); };
    const e3 = (ev) => { handleArchive(ev.detail); };
    const e4 = (ev) => { handleDelete(ev.detail); };
    const e5 = (ev) => { handlePredict(ev.detail); };
    window.addEventListener('editCampaign', e1);
    window.addEventListener('cloneCampaign', e2);
    window.addEventListener('archiveCampaign', e3);
    window.addEventListener('deleteCampaign', e4);
    window.addEventListener('predictCampaign', e5);
    return () => {
      window.removeEventListener('editCampaign', e1);
      window.removeEventListener('cloneCampaign', e2);
      window.removeEventListener('archiveCampaign', e3);
      window.removeEventListener('deleteCampaign', e4);
      window.removeEventListener('predictCampaign', e5);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/campaigns/`);
      setCampaigns(data);
    } catch {
      setError('Failed to load campaigns. Make sure the backend is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  // Handlers for campaign actions
  const handleUpdateCampaign = async (id, payload) => {
    try {
      await axios.put(`${API_BASE_URL}/api/campaigns/${id}`, payload);
      setShowEditModal(false);
      setEditing(null);
      fetchCampaigns();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to update campaign');
    }
  };

  const handleDelete = async (campaign) => {
    if (!confirm(`Delete campaign "${campaign.name}"? This will archive it.`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/campaigns/${campaign.id}`);
      fetchCampaigns();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete campaign');
    }
  };

  const handleArchive = async (campaign) => {
    if (!confirm(`Archive campaign "${campaign.name}"?`)) return;
    try {
      await axios.post(`${API_BASE_URL}/api/campaigns/${campaign.id}/archive`);
      fetchCampaigns();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to archive campaign');
    }
  };

  const handleClone = async (campaign) => {
    if (!confirm(`Clone campaign "${campaign.name}"?`)) return;
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/campaigns/${campaign.id}/clone`);
      // open the cloned campaign in mission control
      if (onOpenMissionControl) onOpenMissionControl(data.id);
      else fetchCampaigns();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to clone campaign');
    }
  };

  const handleModalSuccess = (campaignId) => {
    setShowModal(false);
    // Navigate directly to Mission Control for the new campaign
    if (campaignId && onOpenMissionControl) {
      onOpenMissionControl(campaignId);
    } else {
      fetchCampaigns();
    }
  };

  // Aggregate stats
  const totalRevenue   = campaigns.reduce((s, c) => s + (c.revenue_recovered || 0), 0);
  const runningCount   = campaigns.filter((c) => c.status === 'running').length;
  const completedCount = campaigns.filter((c) => c.status === 'completed').length;

  // Prediction state
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionData, setPredictionData] = useState(null);
  const [showPredictionModal, setShowPredictionModal] = useState(false);

  // Copilot state
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('Bring back customers inactive for 60 days and recover ₹50,000.');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotResult, setCopilotResult] = useState(null);

  const handlePredict = async (campaign) => {
    setPredictionLoading(true);
    setPredictionData(null);
    setShowPredictionModal(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/campaigns/${campaign.id}/predict`);
      setPredictionData(data);
    } catch (err) {
      setPredictionData({ error: err?.response?.data?.detail || 'Failed to compute prediction. Ensure backend is running.' });
    } finally {
      setPredictionLoading(false);
    }
  };

  return (
    <>
      {showModal && (
        <LaunchModal
          onClose={() => setShowModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {showEditModal && (
        <CampaignEditModal
          visible={showEditModal}
          campaign={editing}
          onClose={() => { setShowEditModal(false); setEditing(null); }}
          onSave={handleUpdateCampaign}
        />
      )}

      {showPredictionModal && (
        <PredictionModal
          visible={showPredictionModal}
          onClose={() => { setShowPredictionModal(false); setPredictionData(null); }}
          loading={predictionLoading}
          prediction={predictionData}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 md:px-8 space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-5 pb-6 border-b border-zinc-900">
          <div>
            <span className="text-xs uppercase tracking-widest text-coffee-400 font-bold block mb-1">
              Campaign Orchestration
            </span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-zinc-50 via-coffee-300 to-coffee-500 bg-clip-text text-transparent">
              Campaigns
            </h1>
            <p className="text-zinc-500 text-sm font-medium mt-1.5">
              AI-powered multi-step campaigns built around your RFM segments.
            </p>
          </div>

          {/* Summary pills + Launch btn */}
          <div className="flex flex-wrap items-center gap-3">
            {!loading && campaigns.length > 0 && (
              <>
                <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/50 rounded-xl px-3.5 py-2 text-sm">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-zinc-200">{runningCount}</span>
                  <span className="text-zinc-500 font-medium text-xs">running</span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/50 rounded-xl px-3.5 py-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-zinc-200">{completedCount}</span>
                  <span className="text-zinc-500 font-medium text-xs">completed</span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/50 rounded-xl px-3.5 py-2 text-sm">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-emerald-400">{formatCurrency(totalRevenue)}</span>
                  <span className="text-zinc-500 font-medium text-xs">recovered</span>
                </div>
              </>
            )}

            <button
              id="launch-campaign-btn"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-coffee-600 to-coffee-800 hover:from-coffee-500 hover:to-coffee-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-coffee-950/30 hover:shadow-coffee-950/50 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="w-4 h-4" />
              Launch Campaign
            </button>
            <button
              onClick={() => setShowCopilot(true)}
              className="flex items-center gap-2 bg-sky-700 hover:bg-sky-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
              title="AI Campaign Copilot"
            >
              <Target className="w-4 h-4" />
              Copilot
            </button>
          </div>
        </header>

        {/* ── Campaigns Table ─────────────────────────────────── */}
        <section className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">

          {/* Table meta bar */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-800/60 bg-zinc-900/20">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              All Campaigns · Newest First
            </span>
            <button
              onClick={fetchCampaigns}
              disabled={loading}
              className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* States */}
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="w-14 h-14 rounded-full bg-red-950/40 border border-red-900/50 flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <h3 className="text-zinc-200 font-bold mb-1">Could Not Load Campaigns</h3>
              <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">{error}</p>
              <button
                onClick={fetchCampaigns}
                className="mt-5 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          ) : campaigns.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-coffee-950/30 border border-coffee-900/40 flex items-center justify-center mb-5">
                <Rocket className="w-8 h-8 text-coffee-600" />
              </div>
              <h3 className="text-zinc-200 font-bold mb-2 text-lg">No Campaigns Yet</h3>
              <p className="text-sm text-zinc-500 max-w-xs leading-relaxed mb-6">
                Launch your first AI-powered campaign and watch it build a multi-step strategy automatically.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-coffee-600 to-coffee-800 hover:from-coffee-500 hover:to-coffee-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all shadow-lg shadow-coffee-950/30"
              >
                <Plus className="w-4 h-4" /> Launch Your First Campaign
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
                    <th className="py-3.5 px-6">Campaign</th>
                    <th className="py-3.5 px-6">Goal</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">Revenue Recovered</th>
                    <th className="py-3.5 px-6">Created</th>
                    <th className="py-3.5 px-6 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-sm text-zinc-300">
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    : campaigns.map((c) => (
                        <CampaignRow
                          key={c.id}
                          campaign={c}
                          onOpen={onOpenMissionControl}
                        />
                      ))
                  }
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Copilot Modal */}
        {showCopilot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => setShowCopilot(false)} />
            <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">AI Campaign Copilot</h3>
                <button onClick={() => setShowCopilot(false)} className="text-zinc-400">Close</button>
              </div>

              <div className="space-y-4">
                <textarea value={copilotPrompt} onChange={(e) => setCopilotPrompt(e.target.value)} rows={3} className="w-full p-3 rounded bg-zinc-800 text-zinc-100" />
                <div className="flex gap-2">
                  <button onClick={async () => {
                    // client-side validation
                    if (!copilotPrompt || copilotPrompt.trim().length < 10) {
                      setCopilotResult({ error: 'Please enter a more descriptive prompt (at least 10 characters).' });
                      return;
                    }
                    if (copilotPrompt.length > 800) {
                      setCopilotResult({ error: 'Prompt too long. Please shorten to under 800 characters.' });
                      return;
                    }

                    setCopilotLoading(true); setCopilotResult(null);
                    try {
                      const { data } = await axios.post(`${API_BASE_URL}/api/agent/copilot`, { prompt: copilotPrompt });
                      setCopilotResult(data);
                    } catch (err) {
                      setCopilotResult({ error: err?.response?.data?.detail || 'Failed to generate plan' });
                    } finally { setCopilotLoading(false); }
                  }} className="px-4 py-2 rounded bg-emerald-700 text-white font-bold">Generate Plan</button>
                  <button onClick={() => { setCopilotPrompt('Bring back customers inactive for 60 days and recover ₹50,000.'); }} className="px-4 py-2 rounded bg-zinc-800 text-zinc-200">Reset</button>
                </div>

                {copilotLoading && <div className="text-sm text-zinc-400">Generating plan…</div>}

                {copilotResult && (
                  copilotResult.error ? (
                    <div className="text-sm text-red-400">{copilotResult.error}</div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-bold">Campaign</h4>
                        <div className="mt-2 p-3 bg-zinc-900/30 border border-zinc-800 rounded">
                          <p className="font-bold text-zinc-100">{copilotResult.campaign.name}</p>
                          <p className="text-xs text-zinc-400">{copilotResult.campaign.goal}</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold">Prediction</h4>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div className="p-2 bg-zinc-900/30 border rounded">{formatCurrency(copilotResult.prediction.predicted_revenue || 0)}</div>
                          <div className="p-2 bg-zinc-900/30 border rounded">{copilotResult.prediction.predicted_conversions || 0} conv.</div>
                          <div className="p-2 bg-zinc-900/30 border rounded">{copilotResult.prediction.success_probability || 0}% prob</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold">Steps</h4>
                        <div className="mt-2 space-y-2">
                          {copilotResult.steps.map((s) => (
                            <div key={s.step_id} className="p-3 bg-zinc-900/20 border rounded">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold">Step {s.step_number} — {s.segment_label}</p>
                                  <p className="text-xs text-zinc-400">Channel: {s.channel} · Reach: {s.estimated_reach}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-emerald-400">{s.offer_text}</p>
                                </div>
                              </div>
                              <p className="text-xs text-zinc-300 mt-2 line-clamp-3">{s.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowCopilot(false); fetchCampaigns(); }} className="px-4 py-2 rounded bg-zinc-800 text-zinc-200">Close</button>
                        <button onClick={async () => {
                          // Navigate to mission control for this new campaign
                          const id = copilotResult.campaign.id;
                          setShowCopilot(false);
                          if (onOpenMissionControl) onOpenMissionControl(id);
                          else window.location.reload();
                        }} className="px-4 py-2 rounded bg-coffee-700 text-white font-bold">Open Campaign</button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── How It Works strip ─────────────────────────────── */}
        {!loading && campaigns.length === 0 && !error ? null : (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: <Sparkles className="w-5 h-5 text-coffee-400" />,
                title: 'AI Builds the Strategy',
                desc: 'Gemini analyses your RFM segments and constructs a personalised multi-step outreach plan.',
              },
              {
                icon: <TrendingUp className="w-5 h-5 text-blue-400" />,
                title: 'Auto-Executes Steps',
                desc: 'Each step targets a specific customer tier via the optimal channel — WhatsApp, Email, or SMS.',
              },
              {
                icon: <DollarSign className="w-5 h-5 text-emerald-400" />,
                title: 'Tracks Revenue in Real-Time',
                desc: 'Watch conversions and recovered revenue accumulate live in Mission Control.',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-4 bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4"
              >
                <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 shrink-0">{icon}</div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-200 mb-1">{title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
