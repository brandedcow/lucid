# Product: Lucid

This document describes what the app is and the decisions made so far. Read it before working on features, UI, or copy. If something you're asked to build conflicts with this doc, raise it instead of guessing.

## What it is

A mobile-first personal journal with two kinds of writing:

- **Journal**: everyday writing about what happened and what's on the user's mind.
- **Dream**: capturing dreams right after waking.

The idea behind it: the journal reflects the conscious mind, dreams reflect the unconscious. Over time, seeing the two together helps the user notice patterns and arrive at their own insights.

## Principles

- **Journal first.** Version one is a journal app. There are no AI features in v1.
- **Insight comes from the user.** The app helps the user capture, organize and revisit. It does not interpret, analyze or tell the user what their entries mean.
- **Open structure that guides.** The app offers a light structure (a title, how it felt, tags) so entries are easy to find and compare later, without dictating what the user says. Fields are free text, never fixed lists, scales or ratings, so the user decides what goes in them. Keep required fields to the minimum that makes an entry findable (currently just the dream title); everything else is optional.
- **Low friction.** Capturing should never feel like data entry. The structure above guides but never gets in the way: no streaks, no scores, no gamification.
- **On-device only.** Transcription runs on the device. No audio or text is sent anywhere.
- **Plain language.** The design is inspired by Jungian ideas (conscious and unconscious, recurring symbols, noticing strong reactions), but the app never uses psychological or Jungian terms. No "shadow," "archetype," "individuation," etc. in UI copy, and don't present anything as psychological interpretation.

## Vocabulary

Use these terms consistently in UI copy, code and data models.

| Term          | Meaning                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal entry | A free-form daily writing entry.                                                                                                                                      |
| Dream         | A dream capture, usually made right after waking.                                                                                                                     |
| Title         | A short name the user gives a dream so it can be found later. Required to finish a dream (a Draft needs no title).                                                    |
| Emotion       | Free text about how a dream felt. Optional, never a fixed list or rating.                                                                                             |
| Tag           | A label the user applies to journal entries and dreams.                                                                                                               |
| No dream      | The one-tap option on dream capture for a morning with nothing to record. Intended to count as done for the day (not built yet: today it only opens the Dream log).   |
| Draft         | A dream saved with "Finish later" that is not finished yet. Needs nothing to be saved (a brand-new dream with nothing at all is simply not kept).                     |
| Transcript    | The text of a dream, from live on-device speech recognition or typed. The user can edit it.                                                                           |
| Dream log     | The screen that lists the user's dreams and drafts by month, with a tag filter and search. It is not the journal home; the journal's structure is a separate feature. |
| Dream entry   | One finished dream shown for reading: date, title, feelings, tags, the recording and the transcript. Opened from the Dream log.                                       |

Tags cover anything the user wants to track over time, such as a recurring dream image ("water"), strong emotional reactions, or something practical like "agent mistake." Seeing everything under one tag over time is the main way patterns show up, and it is now possible through the Dream log's tag filter and search. There is no separate "tracker" concept; tags fill that role.

## Core behavior (v1)

### Morning dream capture

- When the user opens the app on waking, it opens to the dream capture screen.
- Dream capture can always be dismissed with one tap via "No dream".
- Once a dream is saved or "No dream" is chosen for the day, the app opens to the journal instead. (Not built yet: today "No dream" only opens the Dream log, and the app always opens to capture.)
- Audio recordings are kept alongside transcripts (a dream written with "Write instead" has no audio).
- Dream capture must be fast: the user should be able to start capturing immediately, since dreams fade within minutes.
- The screen should be calm and low-glare (dark), suitable for use right after waking.

#### After recording: Read it back, then Review

- When recording ends, the user sees **Read it back**: the transcript in an editable text box, with the original recording kept and playable below the text box (hidden while the keyboard is up). The user can fix anything that came out wrong.
- **Continue** goes to **Review**: a title (required to finish), how it felt (optional free text) and tags (optional). The transcript shows there as a short preview with an Edit link back to Read it back.
- Nothing is permanently saved until the user taps **Done** or **Finish later**.
- **Done** finishes the dream and needs a title. **Finish later** saves a draft and needs nothing. A draft appears in the Dream log as "Draft", and tapping it reopens Review.
- The back arrow on Read it back discards an unsaved recording, after a confirmation ("Discard this dream?"). There is no "Delete and record again".
- **Write instead** (on dream capture) opens Read it back with an empty text box and creates a dream with no audio.
- Emotion stays a free-text field, never a fixed list or rating. Quick-pick chips are made from words the user has used before (shown with a capital first letter). Tag suggestions come from tags the user has used before. Nothing is derived from the content of a dream.
- Once finished, the user sees the Dream log.

### Dream log

- The Dream log lists the user's dreams, newest first, grouped by month, under the header "Dreams". It is not the journal home: the journal's structure is a separate feature and is still undecided.
- Each dream is a row with its day, title, a two-line preview of the transcript, and chips for how it felt and its tags. Rows have no play button; the recording is played from the Dream entry.
- Drafts appear in the same list, by date, as an outlined card: the title (or "Untitled dream", followed by the recording length when there is audio), then "Draft · Not reviewed yet · Finish now" with "Draft" in red. Tapping a draft reopens Review.
- A row of tag chips ("All" and each tag with its count) filters the list. The user can select several tags, and a dream must have all of the selected tags to be shown. The row shows the 20 most-used tags; other tags can still be found through search.
- Search looks for the typed words in a dream's title, transcript, feelings and tags. It is plain text matching on the device, not analysis or interpretation of dreams.
- A "New dream" button opens dream capture. When there are no dreams, or nothing matches, the screen says so.
- The filter, the search and the scroll position are kept when the user opens a dream and comes back.

### Dream entry

- Tapping a finished dream opens its Dream entry: the date and time (for example "Sunday, October 4 · 6:42 AM"), the title, all of its feelings and tags as chips, a compact player when the dream has audio, and the transcript in paragraphs ("No text yet" when there is none).
- **Edit** reopens Review for that dream (title, how it felt, tags, and the transcript through Read it back). A finished dream has no "Finish later". **Done** saves the changes and returns to the entry; with no changes it just returns. Going back with unsaved changes asks "Discard changes?".
- Not built: deleting a dream.

### Journal

- Entries are written chronologically.
- The structure of the journal (home screen layout, browsing, timeline) has not been decided yet. Don't design it without checking first.

### Tags

- Tags apply to both journal entries and dreams.
- Tagging is optional and lightweight.
- In the Dream log the user can filter dreams by one or more tags (all selected tags must match) and search by text.

## Platforms

- **Mobile**: capture and daily reflection. This is the primary platform.
- **Desktop/tablet**: browsing, organizing and looking back over time. Later.

## Not in scope yet

Do not build these unless explicitly asked:

- Any AI features (classification, suggestions, summaries, pattern-finding)
- Threads or other higher-level grouping beyond tags
- Tasks or to-do lists
- Periodic roundups or summaries
- An explore/hub view
- Desktop app

## Open decisions

Resolved: dream capture leads with voice, and "Write instead" is the secondary option.

These are undecided. Ask before assuming an answer.

- How "on waking" is detected (time window, first open of the day, user setting)
- Journal structure and navigation
