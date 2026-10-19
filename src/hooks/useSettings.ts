import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, readSettings, writeSettings } from '../services/settingsStorage';

/**
 * The persisted settings. `loaded` turns true after the first read (also when it fails, in which
 * case the defaults apply). A setter updates state at once and saves in the background: a failed
 * save keeps the new value in memory and shows nothing. A read that finishes after a setter call
 * never overwrites the newer value, and nothing updates after unmount.
 */
export function useSettings() {
  const [loaded, setLoaded] = useState(false);
  const [autoOpenNewNote, setAuto] = useState(DEFAULT_SETTINGS.autoOpenNewNote);
  const [onlineTranscription, setOnline] = useState(DEFAULT_SETTINGS.onlineTranscription);
  const changed = useRef(false);
  const changedOnline = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    readSettings()
      .then((settings) => {
        if (!mounted.current) return;
        if (!changed.current) setAuto(settings.autoOpenNewNote);
        if (!changedOnline.current) setOnline(settings.onlineTranscription);
        setLoaded(true);
      })
      .catch(() => {
        if (mounted.current) setLoaded(true);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const setAutoOpenNewNote = useCallback((value: boolean) => {
    changed.current = true;
    setAuto(value);
    writeSettings({ autoOpenNewNote: value }).catch(() => {});
  }, []);

  const setOnlineTranscription = useCallback((value: boolean) => {
    changedOnline.current = true;
    setOnline(value);
    writeSettings({ onlineTranscription: value }).catch(() => {});
  }, []);

  return {
    loaded,
    autoOpenNewNote,
    setAutoOpenNewNote,
    onlineTranscription,
    setOnlineTranscription,
  };
}
