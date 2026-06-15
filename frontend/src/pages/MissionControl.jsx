import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Coffee, Sparkles, TrendingUp, Users, CheckCircle2, 
  PlayCircle, HelpCircle, Send, Smartphone, Mail, 
  MessageSquare, Loader2, ChevronRight, AlertCircle, 
  Target, DollarSign, Activity, RefreshCw, ArrowRight, Rocket
} from 'lucide-react';

// Recharts for analytics
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  FunnelChart,
  Funnel,
  Legend,
} from 'recharts';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function MissionControl({ campaignId = 1 }) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeStepTab, setActiveStepTab] = useState(0);
  const [refreshInterval, setRefreshInterval] = useState(3000); // Poll every 3s
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [segmentStats, setSegmentStats] = useState(null);

  const fetchData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/agent/campaign/${campaignId}`);
      setCampaign(res.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching campaign details:', err);
      setError('Failed to fetch campaign data. Make sure the backend server is running.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setCampaign(null);
    fetchData();
    const timer = setInterval(() => {
      fetchData(true);
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval, campaignId]);

  // Auto-tune polling: faster while running, slower when done
  useEffect(() => {
    if (!campaign) return;
    if (campaign.status === 'running') {
      setRefreshInterval((prev) => (prev > 3000 ? 3000 : prev));
    } else if (campaign.status === 'completed' || campaign.status === 'failed') {
      setRefreshInterval(10000);
    }
  }, [campaign?.status]);

  const handleAutonomousLaunch = async () => {
    if (!campaign) return;
    setIsLaunching(true);
    setLaunchError(null);
    try {
      await axios.post(`${API_BASE_URL}/api/agent/launch_campaign/${campaign.id}`);
      // Immediately refresh to show 'running' state
      fetchData(true);
    } catch (err) {
      setLaunchError(
        err?.response?.data?.detail ||
        'Failed to launch. Make sure the backend is running.'
      );
    } finally {
      setIsLaunching(false);
    }
  };

  const handleExportPDF = async () => {
    if (!campaign) return;
    setExportLoading(true);
    setToast(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/campaigns/${campaign.id}/export_pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `campaign_${campaign.id}_report.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      setToast({ type: 'success', message: 'Export started — check your downloads.' });
    } catch (err) {
      console.error('Failed to export PDF', err);
      setToast({ type: 'error', message: 'Failed to export PDF. Ensure the backend is running.' });
    } finally {
      setExportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-6">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-16 h-16 border-4 border-coffee-500/20 border-t-coffee-500 rounded-full animate-spin"></div>
          <Coffee className="absolute w-6 h-6 text-coffee-400 animate-pulse" />
        </div>
        <p className="text-zinc-400 font-medium tracking-wide animate-pulse">
          Loading Mission Control Room...
        </p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-6">
        <div className="max-w-md w-full bg-zinc-900/80 border border-red-900/30 rounded-2xl p-6 text-center shadow-2xl backdrop-blur-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-bold mb-2 text-zinc-100">Connection Failed</h2>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            {error || "No campaign data could be retrieved from the server."}
          </p>
          <button 
            onClick={() => { setLoading(true); fetchData(); }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-coffee-600 to-coffee-800 hover:from-coffee-500 hover:to-coffee-700 text-white rounded-xl font-semibold shadow-lg shadow-coffee-900/20 hover:shadow-coffee-900/40 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <RefreshCw className="w-4 h-4" /> Try Reconnecting
          </button>
        </div>
      </div>
    );
  }

  // Aggregate Funnel Metrics
  const steps = campaign.steps || [];
  const aggregateMetrics = steps.reduce(
    (acc, step) => {
      acc.sent += step.send_count || 0;
      acc.delivered += step.delivered_count || 0;
      acc.opened += step.opened_count || 0;
      acc.clicked += step.clicked_count || 0;
      acc.converted += step.converted_count || 0;
      return acc;
    },
    { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0 }
  );

  // Active step's reasoning card
  const selectedStep = steps[activeStepTab] || steps[0];
  const preReasoning = selectedStep?.pre_reasoning || {};
  const strategySummary = campaign.agent_plan?.strategy_summary || 'No overall strategy summary recorded.';

  // Format currencies
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Channel helper for icon and badge
  const getChannelDetails = (channel) => {
    switch (channel?.toLowerCase()) {
      case 'whatsapp':
        return {
          icon: <Smartphone className="w-4 h-4 text-green-400" />,
          bg: 'bg-green-950/40 border-green-800/30 text-green-300',
          label: 'WhatsApp'
        };
      case 'email':
        return {
          icon: <Mail className="w-4 h-4 text-sky-400" />,
          bg: 'bg-sky-950/40 border-sky-800/30 text-sky-300',
          label: 'Email'
        };
      case 'sms':
        return {
          icon: <MessageSquare className="w-4 h-4 text-amber-400" />,
          bg: 'bg-amber-950/40 border-amber-800/30 text-amber-300',
          label: 'SMS'
        };
      default:
        return {
          icon: <Send className="w-4 h-4 text-zinc-400" />,
          bg: 'bg-zinc-800/40 border-zinc-700/30 text-zinc-300',
          label: 'Custom'
        };
    }
  };

  // Status helper for colors and animations
  const getStatusDetails = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return {
          bg: 'bg-emerald-950/40 border-emerald-800/30 text-emerald-400',
          dot: 'bg-emerald-400',
          label: 'Completed',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        };
      case 'running':
        return {
          bg: 'bg-amber-950/40 border-amber-700/30 text-amber-400',
          dot: 'bg-amber-400 animate-ping',
          label: 'Running',
          icon: <Activity className="w-4 h-4 text-amber-400 animate-pulse" />
        };
      case 'pending':
      case 'draft':
      default:
        return {
          bg: 'bg-zinc-900/60 border-zinc-800/60 text-zinc-500',
          dot: 'bg-zinc-600',
          label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending',
          icon: <PlayCircle className="w-4 h-4 text-zinc-600" />
        };
    }
  };

  // Funnel calculations
  const calculateFunnelRate = (val, prevVal) => {
    if (!prevVal || !val) return '0%';
    return `${Math.round((val / prevVal) * 100)}%`;
  };

  // ------------------ Chart data preparation ------------------
  // Revenue Trend: use step revenue_recovered and completed_at
  const revenueTrendData = steps.map((s) => ({
    name: `Step ${s.step_number}`,
    revenue: s.revenue_recovered || 0,
    customers: s.send_count || 0,
  }));

  // Conversion Funnel data — use aggregateMetrics
  const funnelData = [
    { name: 'Sent', value: aggregateMetrics.sent },
    { name: 'Delivered', value: aggregateMetrics.delivered },
    { name: 'Opened', value: aggregateMetrics.opened },
    { name: 'Clicked', value: aggregateMetrics.clicked },
    { name: 'Converted', value: aggregateMetrics.converted },
  ];

  // Campaign Performance: per-step conversion rates and revenue per customer
  const performanceData = steps.map((s) => ({
    name: `Step ${s.step_number}`,
    conversion_rate: s.send_count ? Math.round(((s.converted_count || 0) / s.send_count) * 100) : 0,
    revenue_per_customer: s.send_count ? ((s.revenue_recovered || 0) / (s.send_count || 1)) : 0,
    revenue: s.revenue_recovered || 0,
  }));

  
  const pieData = segmentStats
  ? Object.entries(segmentStats).map(([k, v]) => ({
      name: k,
      value: v,
    }))
  : [];

const COLORS = [
  '#34D399',
  '#60A5FA',
  '#F59E0B',
  '#F97316',
  '#A78BFA',
  '#94A3B8',
];

return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:px-8">
      {/* Toast notifications (top-right) */}
      {toast && (
        <div className="fixed top-6 right-6 z-50">
          <div className={`px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-500 text-emerald-900' : 'bg-red-600 text-red-50'}`}>
            {toast.message}
          </div>
        </div>
      )}
      {/* Header bar */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coffee-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-coffee-500"></span>
            </span>
            <span className="text-xs uppercase tracking-wider text-coffee-400 font-bold">
              Autonomous Campaign Brain
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-50 to-coffee-300 bg-clip-text text-transparent">
            Brew & Co. // Mission Control
          </h1>
        </div>

        {/* Refresh controls + Launch button */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            {/* Launch button — only shown when draft/pending */}
            {campaign && (campaign.status === 'draft' || campaign.status === 'pending') && (
              <button
                onClick={handleAutonomousLaunch}
                disabled={isLaunching}
                className="flex items-center gap-2 bg-gradient-to-r from-coffee-600 to-coffee-800 hover:from-coffee-500 hover:to-coffee-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-coffee-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLaunching ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Launching…</>
                ) : (
                  <><Rocket className="w-3.5 h-3.5" /> Launch Autonomously</>
                )}
              </button>
            )}
              <div className="flex items-center bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-1">
              <button 
                onClick={() => fetchData(true)}
                disabled={isRefreshing}
                className={`p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all ${isRefreshing ? 'animate-spin text-coffee-400' : ''}`}
                title="Force Refresh Data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exportLoading}
                className={`ml-2 p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all ${exportLoading ? 'opacity-60 cursor-wait' : ''}`}
                title="Export Campaign PDF"
              >
                {exportLoading ? (
                  <svg className="animate-spin h-4 w-4 text-coffee-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16 8 8 0 01-8-8z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0l4-4m-4 4-4-4M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" />
                  </svg>
                )}
              </button>
              <select 
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-xs text-zinc-400 font-medium px-2 py-1 outline-none border-none focus:ring-0 cursor-pointer"
              >
                <option value="3000">Poll: 3s</option>
                <option value="5000">Poll: 5s</option>
                <option value="10000">Poll: 10s</option>
                <option value="30000">Poll: 30s</option>
              </select>
            </div>
          </div>
          {launchError && (
            <p className="text-xs text-red-400 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {launchError}
            </p>
          )}
        </div>
      </header>

      {/* TOP SECTION: KPI Cards Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {/* KPI: Goal */}
        <div className="relative overflow-hidden bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 shadow-xl backdrop-blur-md hover:border-zinc-700/80 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-coffee-500/5 to-transparent rounded-bl-full pointer-events-none"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Target Goal
            </span>
            <Target className="w-5 h-5 text-coffee-400" />
          </div>
          <h3 className="text-lg font-bold text-zinc-100 leading-snug line-clamp-2 min-h-[56px] flex items-center">
            {campaign.goal}
          </h3>
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex justify-between items-baseline">
            <span className="text-xs text-zinc-500 font-medium">Target Revenue:</span>
            <span className="text-sm font-bold text-coffee-400">
              {formatCurrency(campaign.goal_amount)}
            </span>
          </div>
        </div>

        {/* KPI: Status */}
        <div className="relative overflow-hidden bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 shadow-xl backdrop-blur-md hover:border-zinc-700/80 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-zinc-500/5 to-transparent rounded-bl-full pointer-events-none"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Campaign Status
            </span>
            {getStatusDetails(campaign.status).icon}
          </div>
          <div className="flex flex-col justify-center min-h-[56px]">
            <span className={`inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getStatusDetails(campaign.status).bg}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${getStatusDetails(campaign.status).dot}`}></span>
              {campaign.status}
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex justify-between items-baseline">
            <span className="text-xs text-zinc-500 font-medium">Campaign ID:</span>
            <span className="text-xs font-mono text-zinc-400">#{campaign.id}</span>
          </div>
        </div>

        {/* KPI: Revenue Recovered */}
        <div className="relative overflow-hidden bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 shadow-xl backdrop-blur-md hover:border-zinc-700/80 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-bl-full pointer-events-none"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Revenue Recovered
            </span>
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-h-[56px] flex flex-col justify-end">
            <h3 className="text-2xl font-black text-emerald-400">
              {formatCurrency(campaign.revenue_recovered)}
            </h3>
            {/* Progress bar of revenue target */}
            <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min((campaign.revenue_recovered / (campaign.goal_amount || 1)) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex justify-between items-baseline">
            <span className="text-xs text-zinc-500 font-medium">Target Progress:</span>
            <span className="text-xs font-bold text-zinc-400">
              {Math.round((campaign.revenue_recovered / (campaign.goal_amount || 1)) * 100)}%
            </span>
          </div>
        </div>

        {/* KPI: Customers Reached */}
        <div className="relative overflow-hidden bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 shadow-xl backdrop-blur-md hover:border-zinc-700/80 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-bl-full pointer-events-none"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Audience Reached
            </span>
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-h-[56px] flex flex-col justify-end">
            <h3 className="text-2xl font-black text-blue-400">
              {campaign.total_customers_reached || 0}
            </h3>
            <p className="text-xs text-zinc-500 mt-1 leading-normal">
              Unique customers enrolled
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex justify-between items-baseline">
            <span className="text-xs text-zinc-500 font-medium">Average Step Size:</span>
            <span className="text-xs font-bold text-zinc-400">
              {steps.length ? Math.round((campaign.total_customers_reached || 0) / steps.length) : 0} customers
            </span>
          </div>
        </div>
      </section>

      {/* CHARTS SECTION */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Trend Chart */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 shadow-xl">
          <h3 className="text-sm font-bold text-zinc-200 mb-2">Revenue Trend</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={revenueTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#202225" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip wrapperStyle={{ backgroundColor: '#0f1720', borderRadius: 8 }} />
                <Line type="monotone" dataKey="revenue" stroke="#34D399" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Funnel Chart */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 shadow-xl">
          <h3 className="text-sm font-bold text-zinc-200 mb-2">Conversion Funnel</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <FunnelChart>
                <Tooltip wrapperStyle={{ backgroundColor: '#0f1720', borderRadius: 8 }} />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  {funnelData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Campaign Performance Chart */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 shadow-xl">
          <h3 className="text-sm font-bold text-zinc-200 mb-2">Campaign Performance</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={performanceData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#202225" />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis yAxisId="left" stroke="#9CA3AF" />
                <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" />
                <Tooltip wrapperStyle={{ backgroundColor: '#0f1720', borderRadius: 8 }} />
                <Bar yAxisId="left" dataKey="revenue" barSize={12} fill="#60A5FA" />
                <Line yAxisId="right" type="monotone" dataKey="conversion_rate" stroke="#F59E0B" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Customer Segment Pie Chart */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 shadow-xl">
          <h3 className="text-sm font-bold text-zinc-200 mb-2">Customer Segments</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Tooltip wrapperStyle={{ backgroundColor: '#0f1720', borderRadius: 8 }} />
                <Legend verticalAlign="bottom" wrapperStyle={{ color: '#9CA3AF' }} />
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} fill="#8884d8" label>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* MIDDLE SECTION & RIGHT SIDE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* MIDDLE SECTION: Agent Reasoning Card */}
        <section className="lg:col-span-2 flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
          {/* Header area */}
          <div className="p-5 border-b border-zinc-800/80 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-coffee-950/60 border border-coffee-800/50 p-2 rounded-xl">
                <Sparkles className="w-5 h-5 text-coffee-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-100">AI Campaign Strategist</h2>
                <p className="text-xs text-zinc-500 font-medium">Real-time Campaign Planning & Reasoning</p>
              </div>
            </div>

            {/* Strategy TABS */}
            <div className="flex bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-1">
              {steps.map((step, idx) => (
                <button
                  key={step.id || idx}
                  onClick={() => setActiveStepTab(idx)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${activeStepTab === idx ? 'bg-coffee-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Step {step.step_number || idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Reasoning Content Body */}
          <div className="p-6 flex-1 flex flex-col gap-6">
            {/* Strategy summary (Overall Campaign level) */}
            <div className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-4">
              <span className="text-xs uppercase tracking-wider text-coffee-400 font-bold block mb-1">
                Global Strategy Summary
              </span>
              <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                {strategySummary}
              </p>
            </div>

            {/* Step level details */}
            {selectedStep ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
                
                {/* Left col: why selected */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="h-1 bg-coffee-500 w-3 rounded-full"></span>
                      Why Audience Selected
                    </h4>
                    <div className="bg-zinc-950/40 border border-zinc-900/80 rounded-xl p-4 min-h-[160px]">
                      {preReasoning.reasons && preReasoning.reasons.length > 0 ? (
                        <ul className="space-y-3">
                          {preReasoning.reasons.map((reason, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-zinc-300 leading-relaxed">
                              <span className="text-coffee-400 font-bold mt-0.5">•</span>
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-zinc-500 italic flex items-center justify-center h-28">
                          No specific audience reasoning logged.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right col: channel and expected outcome */}
                <div className="space-y-4">
                  {/* Why channel */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="h-1 bg-coffee-500 w-3 rounded-full"></span>
                      Why Channel Selected
                    </h4>
                    <div className="bg-zinc-950/40 border border-zinc-900/80 rounded-xl p-4 min-h-[72px] text-sm text-zinc-300 leading-relaxed">
                      {preReasoning.why_channel || 'No specific channel reasoning logged.'}
                    </div>
                  </div>

                  {/* Expected outcome */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="h-1 bg-coffee-500 w-3 rounded-full"></span>
                      Expected Outcome
                    </h4>
                    <div className="bg-zinc-950/40 border border-zinc-900/80 rounded-xl p-4 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">Proj. Revenue</span>
                        <span className="text-lg font-extrabold text-emerald-400">
                          {preReasoning.expected_recovery ? formatCurrency(preReasoning.expected_recovery) : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block mb-1">Proj. Conversions</span>
                        <span className="text-lg font-extrabold text-blue-400">
                          {preReasoning.expected_conversions || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-zinc-800 rounded-xl">
                <HelpCircle className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-400">Select a step tab to view reasoning.</p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT SIDE: Campaign Steps Timeline */}
        <section className="flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-coffee-400" />
            <h2 className="text-lg font-bold text-zinc-100">Execution Timeline</h2>
          </div>

          <div className="relative border-l border-zinc-800 ml-3 pl-6 space-y-8 flex-1">
            {steps.map((step, idx) => {
              const channelDetails = getChannelDetails(step.channel);
              const statusDetails = getStatusDetails(step.status);
              const isTabActive = activeStepTab === idx;

              return (
                <div 
                  key={step.id || idx} 
                  className={`relative group cursor-pointer transition-all duration-300 ${isTabActive ? 'scale-[1.02]' : 'hover:scale-[1.01]'}`}
                  onClick={() => setActiveStepTab(idx)}
                >
                  {/* Timeline dot */}
                  <span className={`absolute -left-[31px] top-1.5 flex items-center justify-center w-4 h-4 rounded-full border border-zinc-950 transition-colors ${
                    step.status === 'running' 
                      ? 'bg-amber-500 shadow-lg shadow-amber-500/20' 
                      : step.status === 'completed'
                      ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20'
                      : 'bg-zinc-800'
                  }`}>
                    {step.status === 'running' && (
                      <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping"></span>
                    )}
                  </span>

                  {/* Card container */}
                  <div className={`p-4 rounded-xl border transition-all duration-300 ${
                    isTabActive 
                      ? 'bg-zinc-900/80 border-coffee-800 shadow-md shadow-coffee-950/20' 
                      : 'bg-zinc-900/20 border-zinc-800/60 hover:bg-zinc-900/40 hover:border-zinc-800'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                        Step {step.step_number}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${statusDetails.bg}`}>
                        {statusDetails.label}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-zinc-200 mb-3 line-clamp-1">
                      {step.segment_label}
                    </h4>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      {/* Channel Badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-medium ${channelDetails.bg}`}>
                        {channelDetails.icon}
                        {channelDetails.label}
                      </span>
                      
                      {/* Size / Reach */}
                      <span className="text-zinc-500 font-medium flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {step.customer_count || 0} reached
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* BOTTOM SECTION: Live Funnel Metrics */}
      <section className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-900">
          <div className="flex items-center gap-2.5">
            <div className="bg-coffee-950/60 border border-coffee-800/50 p-2 rounded-xl">
              <TrendingUp className="w-5 h-5 text-coffee-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Live Campaign Funnel</h2>
              <p className="text-xs text-zinc-500 font-medium">Real-time conversions and delivery status</p>
            </div>
          </div>

          {/* Selector for overall vs step funnel */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Viewing Filter:
            </span>
            <div className="flex bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-1">
              <button
                onClick={() => setActiveStepTab(-1)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${activeStepTab === -1 ? 'bg-coffee-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Campaign Total
              </button>
              {steps.map((step, idx) => (
                <button
                  key={step.id || idx}
                  onClick={() => setActiveStepTab(idx)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${activeStepTab === idx ? 'bg-coffee-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Step {step.step_number}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Funnel Metrics Cards */}
        {(() => {
          // Data source: selected step or aggregate
          const isAggregate = activeStepTab === -1;
          const funnelSource = isAggregate ? aggregateMetrics : {
            sent: selectedStep?.send_count || 0,
            delivered: selectedStep?.delivered_count || 0,
            opened: selectedStep?.opened_count || 0,
            clicked: selectedStep?.clicked_count || 0,
            converted: selectedStep?.converted_count || 0,
          };

          // Define the funnel steps for visual display
          const funnelStages = [
            { id: 'sent', label: 'Messages Sent', val: funnelSource.sent, color: 'text-zinc-400', barColor: 'bg-zinc-400' },
            { id: 'delivered', label: 'Delivered', val: funnelSource.delivered, prevId: 'sent', color: 'text-blue-400', barColor: 'bg-blue-400' },
            { id: 'opened', label: 'Opened', val: funnelSource.opened, prevId: 'delivered', color: 'text-purple-400', barColor: 'bg-purple-400' },
            { id: 'clicked', label: 'Clicked', val: funnelSource.clicked, prevId: 'opened', color: 'text-amber-400', barColor: 'bg-amber-400' },
            { id: 'converted', label: 'Converted', val: funnelSource.converted, prevId: 'clicked', color: 'text-emerald-400', barColor: 'bg-emerald-400' },
          ];

          return (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
                {funnelStages.map((stage, idx) => {
                  const val = stage.val;
                  const rate = stage.prevId 
                    ? calculateFunnelRate(val, funnelSource[stage.prevId]) 
                    : null;
                  const conversionPercentage = funnelSource.sent 
                    ? `${Math.round((val / funnelSource.sent) * 100)}%` 
                    : '0%';

                  return (
                    <div key={stage.id} className="relative group">
                      {/* Metric Card */}
                      <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 hover:border-zinc-800 transition-all duration-300 shadow-inner flex flex-col justify-between min-h-[140px]">
                        <div>
                          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                            {stage.label}
                          </span>
                          <span className={`text-3xl font-extrabold ${stage.color}`}>
                            {val}
                          </span>
                        </div>

                        {/* Conversions details */}
                        <div className="mt-4">
                          {rate ? (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Step Rate:</span>
                              <span className={`font-bold ${stage.color}`}>{rate}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Funnel Base:</span>
                              <span className="font-bold text-zinc-400">100%</span>
                            </div>
                          )}
                          <div className="w-full bg-zinc-900 h-1 rounded-full mt-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${stage.barColor}`} 
                              style={{ width: conversionPercentage }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Chevron Divider pointing to next step */}
                      {idx < funnelStages.length - 1 && (
                        <div className="hidden md:flex absolute top-1/2 -right-4 -translate-y-1/2 z-10 items-center justify-center bg-zinc-900 border border-zinc-850 rounded-full w-8 h-8 text-zinc-500 shadow-md">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Recovery Conversion rates info bar */}
              {!isAggregate && selectedStep && (
                <div className="mt-6 p-4 bg-zinc-950/40 border border-zinc-900 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs font-medium text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-400">Step Details:</span>
                    <span>Offer: <span className="text-coffee-300 font-semibold">{selectedStep.offer_text}</span></span>
                    <span>•</span>
                    <span>Reach Size: <span className="text-zinc-300 font-semibold">{selectedStep.customer_count}</span></span>
                  </div>
                  <div>
                    <span>Total Step Revenue Recovered: </span>
                    <span className="text-emerald-400 font-extrabold text-sm ml-1">
                      {formatCurrency(selectedStep.revenue_recovered)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
