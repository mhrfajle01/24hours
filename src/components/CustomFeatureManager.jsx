import React, { useState } from 'react';
import { useCustomFeatures } from '../hooks/useCustomFeatures';

export default function CustomFeatureManager() {
  const { features, loading, addFeature, updateFeature, deleteFeature } = useCustomFeatures();
  const [isEditing, setIsEditing] = useState(false);
  const [currentFeature, setCurrentFeature] = useState(null);

  const [form, setForm] = useState({ title: '', html: '', css: '', js: '', icon: 'bi-star', description: '', link: '' });

  const handleEdit = (feature) => {
    setCurrentFeature(feature);
    setForm({
      title: feature.title || '',
      html: feature.html || '',
      css: feature.css || '',
      js: feature.js || '',
      icon: feature.icon || 'bi-star',
      description: feature.description || '',
      link: feature.link || '',
    });
    setIsEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title) return;
    
    if (currentFeature) {
      await updateFeature(currentFeature.id, form);
    } else {
      await addFeature(form);
    }
    setIsEditing(false);
    setCurrentFeature(null);
    setForm({ title: '', html: '', css: '', js: '', icon: 'bi-star', description: '', link: '' });
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this custom feature?")) {
      await deleteFeature(id);
    }
  };

  if (loading) return <div>Loading features...</div>;

  return (
    <div className="card border-0 shadow-sm rounded-4 p-4 mt-3">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="fw-bold m-0"><i className="bi bi-code-square me-2" />Custom Feature Injector</h5>
        {!isEditing && (
          <button className="btn btn-sm btn-primary rounded-pill fw-bold" onClick={() => setIsEditing(true)}>
            <i className="bi bi-plus-lg me-1" /> New Feature
          </button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSave}>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label small fw-bold">Title</label>
              <input type="text" className="form-control bg-light" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="Widget Name" />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold">Description</label>
              <input type="text" className="form-control bg-light" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Short description" />
            </div>
            <div className="col-md-12">
               <label className="form-label small fw-bold">Icon (Bootstrap Icon Class)</label>
               <input type="text" className="form-control bg-light" value={form.icon} onChange={e => setForm({...form, icon: e.target.value})} placeholder="e.g., bi-star, bi-calculator" />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold">External Link (Optional - overrides HTML/CSS/JS)</label>
            <input type="url" className="form-control bg-light" value={form.link} onChange={e => setForm({...form, link: e.target.value})} placeholder="https://example.com" />
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold">HTML</label>
            <textarea className="form-control bg-dark text-light font-monospace" rows="4" value={form.html} onChange={e => setForm({...form, html: e.target.value})} placeholder="<div>Hello World</div>" />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-bold">CSS</label>
            <textarea className="form-control bg-dark text-light font-monospace" rows="4" value={form.css} onChange={e => setForm({...form, css: e.target.value})} placeholder="div { color: red; }" />
          </div>
          <div className="mb-4">
            <label className="form-label small fw-bold">JavaScript</label>
            <textarea className="form-control bg-dark text-light font-monospace" rows="4" value={form.js} onChange={e => setForm({...form, js: e.target.value})} placeholder="console.log('Loaded');" />
          </div>

          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary rounded-pill fw-bold" onClick={() => { setIsEditing(false); setCurrentFeature(null); setForm({title:'',html:'',css:'',js:'',icon:'bi-star',description:'',link:''}); }}>Cancel</button>
            <button type="submit" className="btn btn-success rounded-pill fw-bold"><i className="bi bi-save me-1" /> Save Feature</button>
          </div>
        </form>
      ) : (
        <div className="list-group">
          {features.length === 0 ? <p className="text-secondary small">No custom features yet.</p> : features.map(f => (
            <div key={f.id} className="list-group-item d-flex justify-content-between align-items-center">
              <div>
                <i className={`bi ${f.icon} me-2`} />
                <span className="fw-bold">{f.title}</span>
                <div className="small text-secondary">{f.description}</div>
              </div>
              <div>
                <button className="btn btn-sm btn-outline-primary me-2 rounded-pill" onClick={() => handleEdit(f)}>Edit</button>
                <button className="btn btn-sm btn-outline-danger rounded-pill" onClick={() => handleDelete(f.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
