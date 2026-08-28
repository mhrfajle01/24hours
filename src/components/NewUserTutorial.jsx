import React from 'react';

const STEPS = [
  { id: 'welcome', title: 'Welcome to 24Hours', text: 'Let’s learn the app by using the real features together.', action: 'Start Tutorial', optional: true },
  { id: 'plan', title: 'Create your first plan', text: 'Add one real hourly plan. The tutorial will continue after it is saved.', action: 'Open Add Plan' },
  { id: 'complete', title: 'Complete a block', text: 'Open your new block, write a report, and mark it Completed.', action: 'I will complete it' },
  { id: 'points', title: 'See your points', text: 'Your completed block awards points. Open the balance to explore the rewards system.', action: 'Open Points' },
  { id: 'hub', title: 'Discover the Productivity Hub', text: 'This is the single place to find the newest features.', action: 'Open Hub' },
  { id: 'journal', title: 'Try Journal', text: 'Open Journal to write reflections, moods, prompts, and history.', action: 'Open Journal' },
  { id: 'streaks', title: 'Try Streaks', text: 'Open Streaks to check in, view milestones, and protect progress.', action: 'Open Streaks' },
  { id: 'streaks-relapse', title: 'Habit Mechanics & Relapses', text: 'Important: If you break a habit (relapse), your streak fully resets to 0. You will also lose a base of 100 points, plus 20 points per day you had on the streak. Stay consistent!', action: 'I understand', optional: true },
  { id: 'rewards', title: 'Explore Rewards Store', text: 'Browse daily items, streak protection, mystery rewards, and unlocks. No purchase is required.', action: 'Open Rewards' },
  { id: 'settings', title: 'Explore Settings', text: 'All configuration is organized in one place, including Tools.', action: 'Open Settings' },
  { id: 'done', title: 'Tutorial complete!', text: 'You have seen the main features. You can replay this tutorial from the app help area later.', action: 'Finish', optional: true },
];

export default function NewUserTutorial({
  stepIndex,
  onStart,
  onSkipStep,
  onExit,
  onAction,
  onFinish,
}) {
  const step = STEPS[stepIndex] || STEPS[0];
  const isWelcome = step.id === 'welcome';
  const isDone = step.id === 'done';

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 2000, pointerEvents: 'none' }}>
      <div className="position-absolute top-0 start-0 w-100 h-100 bg-dark bg-opacity-50" style={{ pointerEvents: 'none' }} />
      <div
        className="position-absolute start-50 translate-middle-x px-3 w-100"
        style={{ maxWidth: 430, bottom: '1rem', pointerEvents: 'auto' }}
      >
        <div className="card border-0 shadow-lg rounded-4 overflow-hidden">
          <div className="p-3 text-white" style={{ background: 'linear-gradient(135deg, #075E54, #128C7E)' }}>
            <div className="d-flex justify-content-between align-items-center">
              <span className="small fw-bold text-uppercase">First-time guide</span>
              <span className="badge bg-white text-success">{stepIndex + 1}/{STEPS.length}</span>
            </div>
            <h4 className="fw-bold mb-0 mt-2">{step.title}</h4>
          </div>
          <div className="p-4">
            <p className="text-secondary mb-4">{step.text}</p>
            {!isWelcome && !isDone && (
              <div className="alert alert-info py-2 px-3 small mb-3">
                <i className="bi bi-hand-index-thumb me-2" />
                Complete the action in the app to continue.
              </div>
            )}
            <div className="d-flex gap-2 justify-content-end">
              {!isDone && (
                <button
                  className="btn btn-link text-secondary text-decoration-none fw-semibold"
                  onClick={onExit}
                >
                  Exit Tutorial
                </button>
              )}
              {isWelcome ? (
                <button className="btn btn-success rounded-pill fw-bold px-4" onClick={onStart}>{step.action}</button>
              ) : isDone ? (
                <button className="btn btn-success rounded-pill fw-bold px-4" onClick={onFinish}>{step.action}</button>
              ) : (
                <>
                  <button
                    className="btn btn-outline-secondary rounded-pill fw-bold px-3"
                    onClick={() => onSkipStep(stepIndex)}
                  >
                    Skip Feature
                  </button>
                  <button className="btn btn-success rounded-pill fw-bold px-4" onClick={() => onAction(step.id)}>{step.action}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { STEPS };
