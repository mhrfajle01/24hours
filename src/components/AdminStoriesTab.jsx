import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export default function AdminStoriesTab({ currentUser, notify, audit }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  
  const [form, setForm] = useState({
    title: '',
    description: '',
    coverImage: '',
    validUntil: '',
    chapters: ['']
  });

  const loadStories = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'stories'));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setStories(items);
    } catch (err) {
      console.error(err);
      notify('Failed to load stories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStories();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingStory) {
        await updateDoc(doc(db, 'stories', editingStory.id), {
          title: form.title,
          description: form.description,
          coverImage: form.coverImage || '',
          validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
          chapters: form.chapters,
          updatedAt: serverTimestamp()
        });
        notify('Story updated!');
      } else {
        await addDoc(collection(db, 'stories'), {
          title: form.title,
          description: form.description,
          coverImage: form.coverImage || '',
          validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
          chapters: form.chapters,
          createdAt: serverTimestamp()
        });
        notify('Story added!');
      }
      setShowForm(false);
      setEditingStory(null);
      loadStories();
    } catch (err) {
      console.error(err);
      notify('Failed to save story');
    }
  };

  const handleEdit = (story) => {
    setEditingStory(story);
    setForm({
      title: story.title || '',
      description: story.description || '',
      coverImage: story.coverImage || '',
      validUntil: story.validUntil ? story.validUntil.split('T')[0] : '',
      chapters: story.chapters || ['']
    });
    setShowForm(true);
  };

  const handleDelete = async (story) => {
    if (!window.confirm('Delete this story?')) return;
    try {
      await deleteDoc(doc(db, 'stories', story.id));
      notify('Story deleted');
      loadStories();
    } catch (err) {
      console.error(err);
      notify('Failed to delete story');
    }
  };

  const updateChapter = (index, text) => {
    const newChapters = [...form.chapters];
    newChapters[index] = text;
    setForm({ ...form, chapters: newChapters });
  };

  const addChapter = () => {
    setForm({ ...form, chapters: [...form.chapters, ''] });
  };

  const removeChapter = (index) => {
    const newChapters = [...form.chapters];
    newChapters.splice(index, 1);
    setForm({ ...form, chapters: newChapters });
  };

  return (
    <section className="admin-section-card">
      <div className="admin-section-heading">
        <div>
          <small>CONTENT</small>
          <h2>Story Books</h2>
        </div>
        <button className="admin-icon-button light" onClick={loadStories} aria-label="Refresh">
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {!showForm ? (
        <>
          <button className="btn btn-success mb-3 w-100 py-2 rounded-3 fw-bold" onClick={() => {
            setEditingStory(null);
            setForm({ title: '', description: '', coverImage: '', validUntil: '', chapters: [''] });
            setShowForm(true);
          }}>
            <i className="bi bi-plus-lg me-2" />Add New Story
          </button>
          
          {loading ? (
            <div className="admin-empty"><span className="spinner-border spinner-border-sm" /> Loading stories...</div>
          ) : stories.length === 0 ? (
            <div className="admin-empty"><i className="bi bi-book" /> No stories found</div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {stories.map(story => (
                <div key={story.id} className="card border-0 rounded-4 p-3 bg-dark text-white shadow-sm" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h5 className="fw-bold mb-0 text-warning">{story.title}</h5>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-outline-light border-0" onClick={() => handleEdit(story)}>
                        <i className="bi bi-pencil" />
                      </button>
                      <button className="btn btn-sm btn-outline-danger border-0" onClick={() => handleDelete(story)}>
                        <i className="bi bi-trash3" />
                      </button>
                    </div>
                  </div>
                  <p className="small text-light opacity-75 mb-2">{story.description}</p>
                  <div className="d-flex justify-content-between small text-white-50">
                    <span>{story.chapters?.length || 0} Chapters</span>
                    {story.validUntil && <span>Expires: {new Date(story.validUntil).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleSave} className="d-flex flex-column gap-3 text-white mt-2">
          <div className="bg-dark p-3 rounded-4 shadow-sm" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="mb-3">
              <label className="fw-bold small text-info mb-2"><i className="bi bi-type me-1"/> Title</label>
              <input required type="text" className="form-control bg-black text-white border-secondary rounded-3 py-2 px-3" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Mystery of the Island..." />
            </div>
            <div className="mb-3">
              <label className="fw-bold small text-info mb-2"><i className="bi bi-card-text me-1"/> Description</label>
              <textarea required className="form-control bg-black text-white border-secondary rounded-3 py-2 px-3" rows="3" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="A gripping tale of..." />
            </div>
            <div className="mb-3">
              <label className="fw-bold small text-info mb-2"><i className="bi bi-image me-1"/> Cover Image URL (Optional)</label>
              <input type="url" className="form-control bg-black text-white border-secondary rounded-3 py-2 px-3" value={form.coverImage} onChange={e => setForm({...form, coverImage: e.target.value})} placeholder="https://example.com/image.jpg" />
            </div>
            <div>
              <label className="fw-bold small text-info mb-2"><i className="bi bi-calendar-event me-1"/> Valid Until (Optional)</label>
              <input type="date" className="form-control bg-black text-white border-secondary rounded-3 py-2 px-3 w-100" value={form.validUntil} onChange={e => setForm({...form, validUntil: e.target.value})} />
            </div>
          </div>
          
          <div className="bg-dark p-3 rounded-4 shadow-sm" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
            <label className="fw-bold small text-info mb-3 d-block border-bottom border-secondary pb-2"><i className="bi bi-collection me-1"/> Chapters</label>
            <div className="d-flex flex-column gap-3">
              {form.chapters.map((chap, idx) => (
                <div key={idx} className="position-relative p-3 rounded-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">
                    <span className="badge bg-secondary">Chapter {idx + 1}</span>
                    {form.chapters.length > 1 && (
                      <button type="button" className="btn btn-sm btn-outline-danger py-1 px-2 rounded-pill" onClick={() => removeChapter(idx)}>
                        <i className="bi bi-trash" /> Remove
                      </button>
                    )}
                  </div>
                  <textarea required className="form-control bg-black text-white border-secondary rounded-3 p-3" rows="5" value={chap} onChange={e => updateChapter(idx, e.target.value)} placeholder="Write chapter content here... Bangla text is fully supported!" style={{ fontSize: '1rem', lineHeight: '1.5' }} />
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-outline-info rounded-pill w-100 mt-4 py-2 fw-bold" onClick={addChapter}>
              <i className="bi bi-plus-lg me-1" /> Add Another Chapter
            </button>
          </div>

          <div className="d-flex flex-column flex-sm-row gap-2 mt-2">
            <button type="button" className="btn btn-secondary rounded-pill py-2 w-100 w-sm-50 fw-bold" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-success rounded-pill py-2 w-100 w-sm-50 fw-bold"><i className="bi bi-check2-circle me-1" /> Save Story</button>
          </div>
        </form>
      )}
    </section>
  );
}
