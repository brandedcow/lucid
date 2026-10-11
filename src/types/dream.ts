import { JournalId } from './entry';
import { sanitizeWaveform } from '../utils/waveform';

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
  /**
   * Which journal the entry belongs to. Absent in records saved before journals existed; those
   * count as 'dreams' (see `entriesFor`) and are never rewritten to add it.
   */
  journalId?: JournalId;
  /**
   * Peaks (0..1, 56 or so) of the recording's loudness, for the playback card. Optional and
   * additive: absent on older entries and on written ones; an invalid value is ignored on load.
   */
  waveform?: number[];
  /**
   * Several recordings per entry. Additive: when present and non-empty it is the truth and the
   * legacy audioFileName/durationMs/waveform are ignored. Read ONLY via `recordingsOf`.
   */
  recordings?: StoredRecording[];
};

/** One stored recording of an entry: a file name inside the dreams directory, never a path. */
export type StoredRecording = {
  fileName: string;
  durationMs: number;
  waveform?: number[];
};

/** The stored record type serves every journal (Dreams, Life, ...); `Dream` is its original name. */
export type Entry = Dream;

export type DreamDetails = {
  title: string;
  /** On update, undefined keeps the stored value and '' (or blank) clears it. On create, omitted means none. */
  emotion?: string;
  tags: string[];
  /** Same rule as emotion: undefined keeps the stored value on update, '' clears it. */
  transcript?: string;
};

export const isDraft = (dream: Dream): boolean => dream.status === 'draft';

/**
 * The entry's recordings. Read audio ONLY through this (never dream.audioFileName/recordings
 * directly). A non-empty `recordings` list wins (entries with a bad file name are dropped, a bad
 * waveform is dropped, a bad duration becomes 0); a malformed or wholly unusable one counts as
 * absent. Otherwise a legacy entry's single recording, otherwise [].
 */
export function recordingsOf(dream: Dream): StoredRecording[] {
  const stored: unknown = dream.recordings;
  if (Array.isArray(stored)) {
    const clean: StoredRecording[] = [];
    for (const item of stored) {
      if (typeof item !== 'object' || item === null) continue;
      const { fileName, durationMs, waveform } = item as Record<string, unknown>;
      if (typeof fileName !== 'string' || fileName === '') continue;
      const wave = sanitizeWaveform(waveform);
      clean.push({
        fileName,
        durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : 0,
        ...(wave ? { waveform: wave } : {}),
      });
    }
    if (clean.length > 0) return clean;
  }
  if (typeof dream.audioFileName === 'string' && dream.audioFileName !== '') {
    const wave = sanitizeWaveform(dream.waveform);
    return [
      {
        fileName: dream.audioFileName,
        durationMs: Number.isFinite(dream.durationMs) ? dream.durationMs : 0,
        ...(wave ? { waveform: wave } : {}),
      },
    ];
  }
  return [];
}

export const hasAudio = (dream: Dream): boolean => recordingsOf(dream).length > 0;
