export type Dream = {
  id: string;
  /** ISO timestamp of when the dream was first stored (a draft counts). */
  createdAt: string;
  /** 0 when there is no audio (the dream was written, not recorded). */
  durationMs: number;
  /** File name of the recording inside the dreams directory (not a full path). Absent = no audio. */
  audioFileName?: string;
  /** Required when finishing. Empty only for drafts and dreams saved before titles existed. */
  title: string;
  /** Optional free text about how the dream felt. */
  emotion?: string;
  /** Optional, lowercase, de-duplicated. */
  tags: string[];
  /** Final edited text only; trimmed; omitted when blank. */
  transcript?: string;
  /** 'draft' while unfinished; absent once finished. */
  status?: 'draft';
};

export type DreamDetails = {
  title: string;
  /** On update, undefined keeps the stored value and '' (or blank) clears it. On create, omitted means none. */
  emotion?: string;
  tags: string[];
  /** Same rule as emotion: undefined keeps the stored value on update, '' clears it. */
  transcript?: string;
};

export const isDraft = (dream: Dream): boolean => dream.status === 'draft';

export const hasAudio = (dream: Dream): boolean => !!dream.audioFileName;
