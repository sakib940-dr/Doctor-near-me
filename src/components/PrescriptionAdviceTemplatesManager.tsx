import { useEffect, useState } from 'react';
import { LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
  deleteMyAdviceTemplate,
  getMyAdviceTemplates,
  saveMyAdviceTemplate,
  type AdviceTemplate,
} from '../services/prescriptions';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Advice template update করা যায়নি।';

export default function PrescriptionAdviceTemplatesManager() {
  const [templates, setTemplates] = useState<AdviceTemplate[]>([]);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const rows = await getMyAdviceTemplates();
    setTemplates(rows);
  }

  useEffect(() => {
    refresh()
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, []);

  async function createTemplate() {
    const text = newText.trim();
    if (!text) return;
    setWorkingId('new');
    setError(null);
    setNotice(null);
    try {
      await saveMyAdviceTemplate(text);
      setNewText('');
      await refresh();
      setNotice('Advice template যোগ হয়েছে।');
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setWorkingId(null);
    }
  }

  async function saveEdit(id: string) {
    const text = editingText.trim();
    if (!text) return;
    setWorkingId(id);
    setError(null);
    setNotice(null);
    try {
      await saveMyAdviceTemplate(text, id);
      setEditingId(null);
      setEditingText('');
      await refresh();
      setNotice('Advice template update হয়েছে।');
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setWorkingId(null);
    }
  }

  async function removeTemplate(id: string) {
    setWorkingId(id);
    setError(null);
    setNotice(null);
    try {
      await deleteMyAdviceTemplate(id);
      if (editingId === id) {
        setEditingId(null);
        setEditingText('');
      }
      await refresh();
      setNotice('Advice template delete হয়েছে।');
    } catch (deleteError) {
      setError(messageFrom(deleteError));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="doctor-advice-template-manager">
      <div className="doctor-advice-template-heading">
        <div>
          <h2>Prescription Advice Templates</h2>
          <p>বারবার ব্যবহার করা advice সংরক্ষণ করুন। Prescription page-এ এগুলো checkbox হিসেবে পাওয়া যাবে।</p>
        </div>
      </div>

      <div className="doctor-advice-template-create">
        <input
          value={newText}
          maxLength={500}
          onChange={(event) => setNewText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void createTemplate(); } }}
          placeholder="যেমন: Take medicine after meal."
        />
        <button type="button" onClick={() => void createTemplate()} disabled={!newText.trim() || workingId === 'new'}>
          {workingId === 'new' ? <LoaderCircle className="spin" /> : <Plus />} Add Template
        </button>
      </div>

      {loading ? (
        <div className="loading-box compact"><LoaderCircle className="spin" /> Advice templates লোড হচ্ছে…</div>
      ) : templates.length ? (
        <div className="doctor-advice-template-list">
          {templates.map((template) => (
            <article key={template.id}>
              {editingId === template.id ? (
                <div className="doctor-advice-template-edit">
                  <input value={editingText} maxLength={500} onChange={(event) => setEditingText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveEdit(template.id); } }} />
                  <button type="button" onClick={() => void saveEdit(template.id)} disabled={!editingText.trim() || workingId === template.id} aria-label="Save advice template">
                    {workingId === template.id ? <LoaderCircle className="spin" /> : <Save />}
                  </button>
                  <button type="button" onClick={() => { setEditingId(null); setEditingText(''); }} aria-label="Cancel edit"><X /></button>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{template.advice_text}</strong>
                    <small>
                      {template.last_used_at
                        ? `Recently used • ${new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(template.last_used_at))}`
                        : 'এখনও prescription-এ ব্যবহার হয়নি'}
                    </small>
                  </div>
                  <div className="doctor-advice-template-actions">
                    <button type="button" onClick={() => { setEditingId(template.id); setEditingText(template.advice_text); }}><Pencil /> Edit</button>
                    <button type="button" className="danger" disabled={workingId === template.id} onClick={() => void removeTemplate(template.id)}>
                      {workingId === template.id ? <LoaderCircle className="spin" /> : <Trash2 />} Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="rx-empty-hint">এখনও কোনো personal advice template তৈরি করা হয়নি।</p>
      )}

      {error && <div className="auth-message error" role="alert">{error}</div>}
      {notice && <div className="auth-message success">{notice}</div>}
    </section>
  );
}
