import React from 'react';
import Home from './pages/Home';
import { SoundProvider } from './contexts/SoundContext';
import './index.css';

/**
 * Main App wrapper importing and rendering the Home page.
 */
function App() {
  return (
    <SoundProvider>
      <Home />
    </SoundProvider>
  );
}

export default App;
