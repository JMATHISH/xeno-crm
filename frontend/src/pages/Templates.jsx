import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Eye } from 'lucide-react';

const API_BASE_URL = 'https://xeno-crm-zcs5.onrender.com';

function TemplateModal({ visible, template, onClose, onSave }) {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body_html, setBodyHtml] = useState(template?.body_html || '');

  useEffect(() => {
    setName(template?.name || '');
    setSubject(template?.subject || '');
    setBodyHtml(template?.body_html || '');
  }, [template]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold mb-3">{template ? 'Edit' : 'Create'} Template</h3>
        <div className="space-y-3">
          <input className="w-full p-2 bg-zinc-800" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          <input className="w-full p-2 bg-zinc-800" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
          <textarea className="w-full p-2 bg-zinc-800 h-48" value={body_html} onChange={(e) => setBodyHtml(e.target.value)} placeholder="HTML body with {{ name }}, {{ discount }}, {{ city }}" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-zinc-800">Cancel</button>
          <button onClick={() => onSave({ name, subject, body_html })} className="px-3 py-2 rounded bg-coffee-700 text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/templates/`);
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleSave = async (payload) => {
    try {
      if (editing) {
        await axios.put(`${API_BASE_URL}/api/templates/${editing.id}`, payload);
      } else {
        await axios.post(`${API_BASE_URL}/api/templates/`, payload);
      }
      setShowModal(false);
      setEditing(null);
      fetch();
    } catch (err) { alert(err?.response?.data?.detail || 'Failed'); }
  };

  const handleDelete = async (t) => {
    if (!confirm('Delete template?')) return;
    await axios.delete(`${API_BASE_URL}/api/templates/${t.id}`);
    fetch();
  };

  const handlePreview = async (t) => {
    const { data } = await axios.post(`${API_BASE_URL}/api/templates/${t.id}/preview`, { name: 'Demo', discount: '20%', city: 'Mumbai' });
    setPreviewHtml(data.html);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black">Email Templates</h1>
        <div>
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 rounded bg-coffee-700 text-white"><Plus className="w-4 h-4" /> New Template</button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        {loading ? <div>Loading…</div> : (
          <table className="w-full text-left">
            <thead><tr className="text-xs text-zinc-500"><th>Name</th><th>Subject</th><th></th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-zinc-800">
                  <td className="py-3 px-2 font-bold">{t.name}</td>
                  <td className="py-3 px-2">{t.subject}</td>
                  <td className="py-3 px-2 text-right">
                    <button onClick={() => { setEditing(t); setShowModal(true); }} className="mr-2 px-2 py-1 rounded bg-zinc-800"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handlePreview(t)} className="mr-2 px-2 py-1 rounded bg-zinc-800"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(t)} className="px-2 py-1 rounded bg-red-800"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <TemplateModal visible={showModal} template={editing} onClose={() => setShowModal(false)} onSave={handleSave} />}

      {previewHtml && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h4 className="font-bold mb-2">Preview</h4>
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
    </div>
  );
}
