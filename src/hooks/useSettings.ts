import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  readSettings,
  writeSettings,
  type TagSortOrder,
} from '../services/settingsStorage';

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
  const [tagSort, setTagSortState] = useState<TagSortOrder>(DEFAULT_SETTINGS.tagSort);
  const [loadImages, setLoadImagesState] = useState(DEFAULT_SETTINGS.loadImages);
  const changed = useRef(false);
  const changedOnline = useRef(false);
  const changedTagSort = useRef(false);
  const changedLoadImages = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    readSettings()
      .then((settings) => {
        if (!mounted.current) return;
        if (!changed.current) setAuto(settings.autoOpenNewNote);
        if (!changedOnline.current) setOnline(settings.onlineTranscription);
        if (!changedTagSort.current) setTagSortState(settings.tagSort);
        if (!changedLoadImages.current) setLoadImagesState(settings.loadImages);
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

  const setTagSort = useCallback((value: TagSortOrder) => {
    changedTagSort.current = true;
    setTagSortState(value);
    writeSettings({ tagSort: value }).catch(() => {});
  }, []);

  const setLoadImages = useCallback((value: boolean) => {
    changedLoadImages.current = true;
    setLoadImagesState(value);
    writeSettings({ loadImages: value }).catch(() => {});
  }, []);

  return {
    loaded,
    autoOpenNewNote,
    setAutoOpenNewNote,
    onlineTranscription,
    setOnlineTranscription,
    tagSort,
    setTagSort,
    loadImages,
    setLoadImages,
  };
}
