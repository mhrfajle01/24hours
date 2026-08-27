import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const SoundContext = createContext();

export const DEFAULT_SOUNDS = {
  success: 'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg',
  missed: 'https://actions.google.com/sounds/v1/cartoon/slide_whistle.ogg',
  points: 'https://actions.google.com/sounds/v1/cartoon/pop.ogg',
  trash: 'https://actions.google.com/sounds/v1/foley/swoosh.ogg',
  timer: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg',
};

// Old broken URLs that were 404 — need to migrate users off them
const BROKEN_URLS = [
  'https://actions.google.com/sounds/v1/bell/bell_ring.ogg',
  'https://actions.google.com/sounds/v1/cartoon/magic_chime_chord.ogg',
  'https://actions.google.com/sounds/v1/foley/paper_crumple.ogg',
  'https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg',
];

const isValidUrl = (str) => {
  if (!str || typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const SoundProvider = ({ children }) => {
  const [soundSettings, setSoundSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('app-sounds');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate: replace any old broken URLs with new defaults
        let migrated = false;
        const result = { ...DEFAULT_SOUNDS, masterEnabled: true };
        for (const [key, value] of Object.entries(parsed)) {
          if (key === 'masterEnabled') {
            result.masterEnabled = value;
          } else if (BROKEN_URLS.includes(value)) {
            // Don't keep broken URL — use new default instead
            migrated = true;
          } else {
            result[key] = value;
          }
        }
        if (migrated) {
          localStorage.setItem('app-sounds', JSON.stringify(result));
        }
        return result;
      }
    } catch (e) {
      console.error('Failed to parse sound settings', e);
    }
    return { ...DEFAULT_SOUNDS, masterEnabled: true };
  });

  // Use a ref to always have the latest soundSettings available in playSound
  // This prevents stale closure issues when playSound is called from other components
  const settingsRef = useRef(soundSettings);
  settingsRef.current = soundSettings;
  const audioCacheRef = useRef(new Map());

  useEffect(() => {
    Object.values(DEFAULT_SOUNDS).forEach((url) => {
      if (!audioCacheRef.current.has(url)) {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audioCacheRef.current.set(url, audio);
        audio.load();
      }
    });
  }, []);

  const updateSoundSetting = (key, value) => {
    setSoundSettings(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem('app-sounds', JSON.stringify(updated));
      return updated;
    });
  };

  const playSound = useCallback((key) => {
    const settings = settingsRef.current;
    if (!settings.masterEnabled) return;

    // Determine the URL: use custom if valid, otherwise fall back to default
    const customUrl = settings[key];
    const defaultUrl = DEFAULT_SOUNDS[key];
    const url = (isValidUrl(customUrl) ? customUrl : defaultUrl);

    if (!url) return;

    try {
      let audio = audioCacheRef.current.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.preload = 'auto';
        audioCacheRef.current.set(url, audio);
      }
      audio.currentTime = 0;
      audio.volume = 1.0;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.warn(`Audio play failed for "${key}":`, e.message);
          // If custom URL failed, try fallback to default
          if (customUrl && customUrl !== defaultUrl && isValidUrl(defaultUrl)) {
            try {
              const fallbackAudio = new Audio(defaultUrl);
              fallbackAudio.volume = 1.0;
              fallbackAudio.play().catch(() => {});
            } catch {}
          }
        });
      }
    } catch (err) {
      console.error('Failed to create audio:', err);
    }
  }, []);

  return (
    <SoundContext.Provider value={{ soundSettings, updateSoundSetting, playSound }}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => useContext(SoundContext);
