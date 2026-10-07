import { MutableRefObject, useCallback, useRef, useState } from 'react';
import { toggleTag as toggleTagIn } from '../utils/dreamLog';

export type LogView = {
  /** Selected tag filters (a dream must have all of them). */
  tags: string[];
  query: string;
  /** True while the search field replaces the title row. */
  searching: boolean;
  /** Last scroll offset of the Dream log list. Reset to 0 whenever the tags or query change. */
  offsetRef: MutableRefObject<number>;
  toggleTag: (tag: string) => void;
  setQuery: (query: string) => void;
  openSearch: () => void;
  /** Clears the query and closes the search field. */
  closeSearch: () => void;
  /** Clears the tags and the query and closes the search field. */
  clearFilters: () => void;
};

/**
 * The Dream log's view state (tag filter, search, scroll offset). Lives above the screen (in App)
 * so it survives leaving the log and coming back.
 */
export function useLogView(): LogView {
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQueryState] = useState('');
  const [searching, setSearching] = useState(false);
  const offsetRef = useRef(0);

  const toggleTag = useCallback((tag: string) => {
    offsetRef.current = 0;
    setTags((current) => toggleTagIn(current, tag));
  }, []);

  const setQuery = useCallback((next: string) => {
    offsetRef.current = 0;
    setQueryState(next);
  }, []);

  const openSearch = useCallback(() => setSearching(true), []);

  const closeSearch = useCallback(() => {
    offsetRef.current = 0;
    setQueryState('');
    setSearching(false);
  }, []);

  const clearFilters = useCallback(() => {
    offsetRef.current = 0;
    setTags([]);
    setQueryState('');
    setSearching(false);
  }, []);

  return {
    tags,
    query,
    searching,
    offsetRef,
    toggleTag,
    setQuery,
    openSearch,
    closeSearch,
    clearFilters,
  };
}
