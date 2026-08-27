import React, { useState } from 'react';

const sections = [
  { id: 'overview', label: 'Overview', icon: 'bi-grid-1x2-fill' },
  { id: 'journal', label: 'Journal', icon: 'bi-journal-text' },
  { id: 'streaks', label: 'Streaks', icon: 'bi-fire' },
  { id: 'rewards', label: 'Rewards', icon: 'bi-coin' },
  { id: 'insights', label: 'Insights', icon: 'bi-bar-chart-line-fill' },
];

const cards = [
  { id: 'journal', title: 'Journal', text: 'Write reflections, track moods, and review entries.', icon: 'bi-journal-text', color: '#6f42c1' },
  { id: 'streaks', title: 'Streaks', text: 'Check in, protect habits, and reach milestones.', icon: 'bi-fire', color: '#fd7e14' },
  { id: 'rewards', title: 'Rewards Store', text: 'Spend points on freezes, perks, and unlocks.', icon: 'bi-shop', color: '#198754' },
  { id: 'insights', title: 'Insights', text: 'Review consistency, goals, and productivity trends.', icon: 'bi-bar-chart-line-fill', color: '#0d6efd' },
];

export default function FeatureHubPage({
  points = 0,
  streakDays = 0,
  onClose,
  onOpenJournal,
  onOpenStreaks,
  onOpenRewards,
  onOpenInsights,
  fullPage = false,
}) {
  const [activeSection, setActiveSection] = useState('overview');

  const openSection = (id) => {
    setActiveSection(id);
    if (id === 'journal') onOpenJournal?.();
    if (id === 'streaks') onOpenStreaks?.();
    if (id === 'rewards') onOpenRewards?.();
    if (id === 'insights') onOpenInsights?.();
  };

  return (
    <div
      className={`feature-hub-page w-100 overflow-auto ${fullPage ? '' : 'position-fixed top-0 start-0 h-100'}`}
      style={{ zIndex: 1050, minHeight: fullPage ? 'calc(100dvh - 62px)' : undefined, background: '#ECE5DD' }}
    >
      <div className="container-fluid max-width-container py-3 py-md-4 px-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <div className="text-success fw-bold small text-uppercase">Productivity Hub</div>
            <h2 className="fw-bold text-dark mb-0">Everything in one place</h2>
            <div className="text-secondary small">Discover features without changing the app’s familiar navigation.</div>
          </div>
          <button className="btn btn-outline-secondary rounded-pill fw-bold" onClick={onClose}>
            <i className="bi bi-arrow-left me-1" /> Back
          </button>
        </div>

        <div className="d-flex gap-2 overflow-auto pb-2 mb-3">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`btn btn-sm rounded-pill text-nowrap fw-bold ${activeSection === section.id ? 'btn-success' : 'btn-light border'}`}
              onClick={() => openSection(section.id)}
            >
              <i className={`bi ${section.icon} me-1`} />{section.label}
            </button>
          ))}
        </div>

        {activeSection === 'overview' && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-6 col-lg-3">
                <div className="card border-0 shadow-sm rounded-4 p-3 h-100">
                  <div className="text-secondary small">Points balance</div>
                  <div className="fs-3 fw-bold text-success">🪙 {points.toLocaleString()}</div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="card border-0 shadow-sm rounded-4 p-3 h-100">
                  <div className="text-secondary small">Current streak</div>
                  <div className="fs-3 fw-bold text-warning">🔥 {streakDays} days</div>
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <div className="card border-0 shadow-sm rounded-4 p-3 h-100">
                  <div className="fw-bold text-dark mb-1">Start here</div>
                  <div className="text-secondary small">Choose a feature below, or use the tabs to jump directly to a section.</div>
                </div>
              </div>
            </div>
            <div className="row g-3">
              {cards.map((card) => (
                <div className="col-12 col-md-6 col-xl-4" key={card.id}>
                  <button className="card border-0 shadow-sm rounded-4 p-3 text-start w-100 h-100 hover-scale" onClick={() => openSection(card.id)}>
                    <div className="d-flex align-items-center gap-3">
                      <span className="rounded-circle d-flex align-items-center justify-content-center text-white" style={{ width: 44, height: 44, background: card.color }}>
                        <i className={`bi ${card.icon} fs-5`} />
                      </span>
                      <span>
                        <strong className="d-block text-dark">{card.title}</strong>
                        <small className="text-secondary">{card.text}</small>
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {activeSection === 'rewards' && (
          <div className="card border-0 shadow-sm rounded-4 p-3">
            <div className="d-flex align-items-center justify-content-between gap-3">
              <div>
                <h5 className="fw-bold text-dark mb-1"><i className="bi bi-shop text-success me-2" />Rewards Store</h5>
                <p className="text-secondary small mb-0">Spend points on streak protection, mystery rewards, and feature unlocks.</p>
              </div>
              <button className="btn btn-success rounded-pill fw-bold text-nowrap" onClick={onOpenRewards}>
                <i className="bi bi-arrow-right-circle me-1" />Open Store
              </button>
            </div>
            <div className="row g-2 mt-3">
              <div className="col-6 col-md-3"><div className="bg-light rounded-3 p-2 text-center"><div className="small text-secondary">Balance</div><strong className="text-success">🪙 {points.toLocaleString()}</strong></div></div>
              <div className="col-6 col-md-3"><div className="bg-light rounded-3 p-2 text-center"><div className="small text-secondary">Daily items</div><strong className="text-dark">Available</strong></div></div>
              <div className="col-6 col-md-3"><div className="bg-light rounded-3 p-2 text-center"><div className="small text-secondary">Protection</div><strong className="text-dark">Streak tools</strong></div></div>
              <div className="col-6 col-md-3"><div className="bg-light rounded-3 p-2 text-center"><div className="small text-secondary">Unlocks</div><strong className="text-dark">7-day access</strong></div></div>
            </div>
          </div>
        )}

        {activeSection === 'journal' && (
          <div className="card border-0 shadow-sm rounded-4 p-3">
            <h5 className="fw-bold text-dark mb-1"><i className="bi bi-journal-text text-primary me-2" />Journal</h5>
            <p className="text-secondary small">Write reflections, track moods, and review your previous entries.</p>
            <button className="btn btn-primary rounded-pill fw-bold align-self-start" onClick={onOpenJournal}>
              <i className="bi bi-pencil-square me-1" />Open Journal
            </button>
          </div>
        )}

        {activeSection === 'streaks' && (
          <div className="card border-0 shadow-sm rounded-4 p-3">
            <h5 className="fw-bold text-dark mb-1"><i className="bi bi-fire text-warning me-2" />Streaks</h5>
            <p className="text-secondary small">Check in, view milestones, protect your progress, and review history.</p>
            <button className="btn btn-warning rounded-pill fw-bold align-self-start" onClick={onOpenStreaks}>
              <i className="bi bi-arrow-right-circle me-1" />Open Streaks
            </button>
          </div>
        )}

        {activeSection === 'insights' && (
          <div className="card border-0 shadow-sm rounded-4 p-3">
            <h5 className="fw-bold text-dark mb-1"><i className="bi bi-bar-chart-line-fill text-info me-2" />Insights</h5>
            <p className="text-secondary small">Review consistency, goals, heatmaps, and productivity trends.</p>
            <button className="btn btn-info rounded-pill fw-bold text-white" onClick={onOpenInsights}>
              <i className="bi bi-graph-up me-1" />Open Insights
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
