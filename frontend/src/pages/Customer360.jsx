import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Calendar, Users, DollarSign, MessageSquare, FileText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const API_BASE_URL = 'https://xeno-crm-zcs5.onrender.com';

export default function Customer360({ id: propId = null }) {
  const { id: routeId } = useParams() || {};
  const id = propId || routeId;
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios.get(`${API_BASE_URL}/api/customers/${id}/360`).then((res) => {
      setData(res.data);
      setError(null);
    }).catch((err) => {
      setError('Failed to load customer 360. Ensure backend is running.');
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="p-8 text-zinc-200">Loading customer…</div>
  );

  if (error) return (
    <div className="p-8 text-red-500">{error}</div>
  );

  const profile = data.profile || {};

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:px-8 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded bg-zinc-900/30"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h1 className="text-2xl font-extrabold">{profile.name}</h1>
          <p className="text-sm text-zinc-400">{profile.email} • {profile.phone || '—'} • {profile.city || '—'}</p>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400 uppercase">Total Spend</p>
              <p className="text-2xl font-bold text-emerald-400">₹{Number(data.total_spend || 0).toLocaleString('en-IN')}</p>
            </div>
            <DollarSign className="w-7 h-7 text-emerald-300" />
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400 uppercase">Avg Order Value</p>
              <p className="text-2xl font-bold text-blue-300">₹{Number(data.avg_order_value || 0).toLocaleString('en-IN')}</p>
            </div>
            <FileText className="w-7 h-7 text-blue-300" />
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400 uppercase">RFM Score</p>
              <p className="text-2xl font-bold text-coffee-300">{data.rfm?.rfm_score || '—'}</p>
              <p className="text-xs text-zinc-500 mt-1">{data.rfm?.rfm_tier || 'Unassigned'}</p>
            </div>
            <Users className="w-7 h-7 text-coffee-300" />
          </div>
        </div>
      </div>

      {/* Churn card */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400 uppercase">Churn Risk</p>
              <p className="text-2xl font-bold text-rose-400">{data.profile?.churn_score != null ? `${data.profile.churn_score}/100` : '—'}</p>
              <p className="text-sm text-zinc-300 mt-1">{data.profile?.churn_label || 'Unknown'}</p>
            </div>
            <div className="text-sm text-zinc-400 max-w-lg">
              <p className="text-xs text-zinc-500">Explanation</p>
              <p className="text-sm text-zinc-300 mt-1">{data.profile?.churn_explanation || 'No explanation available.'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid: Order history, Communications, Campaigns, Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Profile Info card */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold mb-2">Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-400">Name</p>
                <p className="text-sm text-zinc-100 font-semibold">{profile.name}</p>

                <p className="text-xs text-zinc-400 mt-3">Email</p>
                <p className="text-sm text-zinc-100">{profile.email}</p>

                <p className="text-xs text-zinc-400 mt-3">Phone</p>
                <p className="text-sm text-zinc-100">{profile.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">City</p>
                <p className="text-sm text-zinc-100">{profile.city || '—'}</p>

                <p className="text-xs text-zinc-400 mt-3">Created</p>
                <p className="text-sm text-zinc-100">{profile.created_at}</p>

                <p className="text-xs text-zinc-400 mt-3">Channel Pref</p>
                <p className="text-sm text-zinc-100">{profile.channel_preference}</p>
              </div>
            </div>
          </div>

          {/* Order History */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold mb-2">Order History</h3>
            <div className="max-h-72 overflow-y-auto">
              {data.orders.length === 0 ? (
                <p className="text-sm text-zinc-500">No orders found.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-zinc-400 text-xs uppercase">
                      <th className="py-2">Date</th>
                      <th className="py-2">Product</th>
                      <th className="py-2">Category</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-t border-zinc-800/40">
                        <td className="py-2 text-zinc-400">{new Date(o.created_at).toLocaleDateString()}</td>
                        <td className="py-2 text-zinc-100">{o.product_name}</td>
                        <td className="py-2 text-zinc-400">{o.product_category}</td>
                        <td className="py-2 text-right text-emerald-400">₹{Number(o.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Communication History */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold mb-2">Communication History</h3>
            <div className="max-h-64 overflow-y-auto text-sm">
              {data.communications.length === 0 ? (
                <p className="text-sm text-zinc-500">No communication logs.</p>
              ) : (
                <ul className="space-y-2">
                  {data.communications.map((c) => (
                    <li key={c.id} className="bg-zinc-950/30 p-3 rounded">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-zinc-400">{c.channel} • {c.status}</p>
                          <p className="text-sm text-zinc-100">{c.message?.slice(0, 120) || '—'}</p>
                        </div>
                        <div className="text-xs text-zinc-500">{new Date(c.created_at).toLocaleString()}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right column: campaigns & timeline */}
        <div className="space-y-4">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold mb-2">Campaigns</h3>
            {data.campaigns.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaigns touched.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.campaigns.map((cp) => (
                  <li key={cp.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-100 font-semibold">{cp.name}</p>
                      <p className="text-xs text-zinc-400">Status: {cp.status}</p>
                    </div>
                    <div className="text-sm text-emerald-400">₹{Number(cp.revenue_recovered || 0).toLocaleString('en-IN')}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold mb-2">Timeline</h3>
            <div className="max-h-96 overflow-y-auto text-sm">
              {data.timeline.length === 0 ? (
                <p className="text-sm text-zinc-500">No timeline events.</p>
              ) : (
                <ol className="space-y-3">
                  {data.timeline.map((t, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 mt-1" />
                      <div>
                        <p className="text-xs text-zinc-400">{new Date(t.date).toLocaleString()}</p>
                        <p className="text-sm text-zinc-100 font-semibold">{t.label}</p>
                        <p className="text-xs text-zinc-500">{t.details && JSON.stringify(t.details)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
