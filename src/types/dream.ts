export type Dream = {
  id: string;
  /** ISO timestamp of when the dream was saved. */
  createdAt: string;
  durationMs: number;
  /** File name of the recording inside the dreams directory (not a full path). */
  audioFileName: string;
  /** Required when saving. Empty only for dreams saved before titles existed. */
  title: string;
  /** Optional free text about how the dream felt. */
  emotion?: string;
  /** Optional, lowercase, de-duplicated. */
  tags: string[];
};

export type DreamDetails = { title: string; emotion?: string; tags: string[] };
