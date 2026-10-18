# Product: Lucid

This document describes what the app is and the decisions made so far. Read it before working on features, UI, or copy. If something you're asked to build conflicts with this doc, raise it instead of guessing.

**Status of this document (2026-10-18).** The concept below (notes organized by tags) was decided on 2026-10-18 and is being built on the branch `feat/notes-model`. The code still implements the older concept (a separate title field, containers for writing and an explicit save step; see Retired terms) until the later chunks land. Each section carries a status line: **Built** means the app does it today under the older concept and the behavior carries over; **Planned** means decided but not built yet; **Open** means undecided (ask before assuming).

## What it is

A mobile-first, voice-first note app. The user writes notes in markdown, attaches voice notes to them, and finds them again through tags. There are no folders or containers: tags are the only organization.

Capturing something quickly, by voice or by typing, is the core. The first launch each day opens a new note so the user can capture straight away.

## Principles

- **Notes first.** Version one is a notes app. There are no AI features in v1.
- **Insight comes from the user.** The app helps the user capture, organize and revisit. It does not interpret, analyze or tell the user what their notes mean.
- **Open structure that guides.** The only structure is what the user writes: the first line is the title, and `#words` are tags. Nothing is a fixed list, scale or rating, and nothing is required.
- **Low friction.** Capturing should never feel like data entry. No streaks, no scores, no gamification.
- **On-device only.** Transcription runs on the device. No audio or text is sent anywhere.
- **Plain language.** The app never uses psychological or Jungian terms in UI copy, and never presents anything as psychological interpretation. The older text's Jungian-inspired framing is dropped and stays dropped.

## Vocabulary

Use these terms consistently in UI copy, code and data models. Status: **Planned** (the code still uses the older terms until the later chunks land).

| Term             | Meaning                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Note             | One piece of writing: markdown text (the body) with optional voice notes. Everything the user writes is a note.                                                    |
| Title            | The first line of the body. Derived, never stored separately. Shows as "Untitled" when the first line is empty or only a tag.                                      |
| Tag              | A label written in the body as `#word`. Flat: no nesting (`#a/b` is not a hierarchy). Derived from the body on read, never stored separately.                      |
| Body             | The markdown text of a note, including its first line.                                                                                                             |
| Voice note       | An audio recording attached to a note (a note can have several), shown as a card with play, a waveform and a close button; tapping a card opens the expanded view. |
| Transcript       | The text of a voice note produced by on-device transcription, added to the body. Transcribing after recording is planned, not built.                               |
| Today view       | A smart view in the drawer: notes created today.                                                                                                                   |
| Todo view        | A smart view: notes that contain at least one checkbox line.                                                                                                       |
| Untagged view    | A smart view: notes with no tag.                                                                                                                                   |
| Pinned           | A smart view of the notes the user pinned; also the act of pinning a note.                                                                                         |
| Recently Deleted | Where a deleted note goes. The user can restore it or delete it forever.                                                                                           |
| Drawer           | The left-hand panel: smart-view dropdown, the list of tags, Recently Deleted and Settings.                                                                         |
| Search           | Search by words and tags across all notes.                                                                                                                         |

Tags cover anything the user wants to track over time, such as a recurring theme or something practical like "agent mistake." Seeing everything under one tag over time is the main way patterns show up. There is no separate "tracker" concept; tags fill that role.

## Core behavior (v1)

### Notes and markdown

Status: **Planned** (the editor is the older editor page with a separate title field and a plain body; markdown styling is not built).

- A note is markdown text. The first line is the title. If the first line is empty or only a tag, the title shows as "Untitled". The title is never stored; it is read from the body each time.
- Markdown scope in v1: headings, bullets, numbered lists, checkboxes (`- [ ]` and `- [x]`), bold and italic. Nothing else (no links, code, tables or images in v1).
- Checkboxes are plain markdown text. There are no task features: no due dates, reminders, assignment or completion tracking. The Todo view simply lists notes that contain checkboxes.
- Open: how markdown is shown while editing (live styling in the text field versus a separate reading view) is a technical choice still to be made and is not decided here.
- Tags are written in the body as `#word`, one word each, no spaces, no nesting, and are shown highlighted as they are typed. Tags are not stored separately: they are read from the body. Nothing is derived from the content beyond what the user typed.

### The editor

Status: **Planned** for autosave and the first-line title. The code at this commit still implements the older explicit-save flow (see Retired terms), and still has a separate title field.

- One page creates and edits every note. Top bar: a back arrow and, for a saved note, a "..." menu. Under it: the date, optional **voice note cards** and the **body**. At the bottom, above the keyboard when it is open, a **toolbar**: undo, redo, record a voice note, "#" for tags, and (planned) a checkbox toggle for the current line; above it, while a tag is being typed, a row of tag suggestions.
- **Autosave.** There is no save button and no check. The editor saves on its own: a note is saved shortly after typing stops, and again when the user leaves the editor. An empty note (no text and no voice note) is never kept. Leaving the editor never asks whether to save or discard.
- **Tag suggestions.** While a tag is being typed, a row above the toolbar suggests tags the user has used before and tags already in this note; tapping one completes the word. The "#" button types a `#` at the cursor.
- **Undo and redo** cover typing in the body (tags included, since they are body text) and closing a voice note (one history, most recent first). They are off while the recording panel is open.
- **Leaving.** The back arrow (and Android back) leaves the editor and returns to where the note was opened; what is on the note is already saved. While the recording panel is open and idle, back just closes it. While recording, back first asks "Discard this recording?" (Keep recording / Discard), and Discard deletes the unsaved recording and then carries on leaving.
- Opening a saved note does not open the keyboard by itself.

### Voice notes

Status: **Built** (the same behavior carries over to notes). Transcription after recording is **Planned**.

- The waveform button in the toolbar opens a recording panel at the bottom of the page. It starts idle (a large timer, a flat waveform and a big red button); tapping the red button starts recording (the time and a live waveform; no pause) and tapping it again stops. Closing the idle panel (its handle, or back) needs no confirmation.
- When a recording stops, a card appears above the body: play/pause, a waveform that fills in as the voice note plays, its length, and a close button. The toolbar button stays available, so a note can hold several voice notes (no limit); with several, the cards sit in a row the user swipes sideways in the order recorded (the next one peeks in, with page dots) and only one plays at a time.
- Tapping a card opens the **expanded view**: share, trash, a large waveform to scrub, the time, back and forward 15 seconds, play/pause and a playback-speed button; with several voice notes the user swipes between them. Trash is the same as the card's close.
- **Closing a voice note.** Each card has a close button that removes that voice note from the note. Status: **Open**. Under the older explicit save, closing a stored voice note deleted its audio only on save and could be undone; with autosave a close would take effect at once, so what happens to the audio is not decided (see Open decisions). Until decided, nothing stored is deleted by a close.
- Voice notes are kept with the note when it is saved. The app does not yet turn a voice note into text: the body is typed (transcribing after recording is planned and needs a device test; there is no live text while recording). Transcription, when built, runs on the device only.

### Launch and first note of the day

Status: **Built** under the older concept (the first launch each day opens the capture page); **Planned** for notes as described here.

- When the user opens the app and nothing is done yet today, it opens to a new, empty note. Once a note with content exists today, or the user backs out of the empty new note (see below), the app opens to the note list for the rest of that day. This can be turned off in Settings.
- The launch note can always be dismissed with one tap: its back arrow (and Android back) while the note is empty counts as done for the day: the day marker is written, the app lands on the note list, and the launch note does not reappear that day. There is no confirmation and no separate button. With something on the note, back just leaves; the note is already saved by autosave, which makes today done.
- The app remembers only the latest date it was counted done, in a small file on the device (the existing day marker). Nothing leaves the phone.
- Whether today is done is worked out from the saved notes and that marker. Deleting today's only note (moving it to Recently Deleted) does not reopen the launch note: once today is done it stays done for that day.
- The launch also applies when the app returns to the foreground on a different day than it left on, nothing is done today, and the setting is on. It never does this while the user is on the editor (or while a note is being saved or deleted), and never when midnight passes while the app is open. It happens at most once per new day.
- The app waits briefly for its stored data before deciding, with a cap of 1000 ms: if the data is not ready by then, it opens a new note so capturing is never delayed.
- Starting must be fast: the editor opens with the body focused and the voice note one tap away.
- The screen should be calm and low-glare (dark), suitable for use first thing in the morning.

### Note list and drawer

Status: **Planned** (the app currently has different list screens).

- The main screen is a note list: each row shows the title, a short preview of the body and a relative time ("5 min ago", "Yesterday"). Newest first. A round "+" button at the bottom right starts a new note; leaving the editor returns to the list.
- A **drawer** opens from the left (a swipe from the left edge or a menu button). It holds, top to bottom: a dropdown to choose the smart view, the list of tags, **Recently Deleted**, and **Settings**.
- **Smart views** (chosen from the dropdown): **Today** (notes created today), **Todo** (notes that contain checkboxes), **Untagged** (notes with no tag) and **Pinned**. Choosing a tag in the drawer lists the notes with that tag. The chosen view or tag is kept when the user opens a note and comes back.
- Tags in the drawer are flat, shown with how many notes use them, sorted alphabetically. Open: whether the drawer shows every tag or only the most used.
- Which day a note belongs to follows when it was first stored, in the device's local time.
- Rows swipe to delete (this moves the note to Recently Deleted). Screen readers get a "Delete" action on every row instead of the swipe.
- Pinning a note puts it in the Pinned view. Pin is in the note's "..." menu and by swipe on a note row (the swipe directions are to be designed). Open: whether pinned notes also sort first in the main list.

### Opening a saved note

Status: **Built** under the older concept (a saved item opens on the editable page); the note wording is **Planned**.

- Tapping a note in the list or in Search opens it on the editable editor page, with its body (tags highlighted) and voice notes. There is no separate reading screen. Edits are saved by autosave; back (the arrow or Android back) returns to where the note was opened.
- A "..." (More options) menu at the top right shows for a saved note only. Its items are **Pin** (planned) and, in red, **Delete** (see Deleting notes).

### Deleting notes

Status: **Planned**. The app today deletes permanently with no trash.

- **Delete** (in the "..." menu, or by swiping a row) moves the note to **Recently Deleted**. Its voice notes are kept with it. Nothing is removed from the phone at this point. When deleted from the editor, the app returns to where the note was opened, with no prompt.
- In Recently Deleted the user can **Restore** a note (it returns to the list with its voice notes) or **Delete forever**.
- **Delete forever** and **Empty Recently Deleted** are the only ways a note and its voice notes' audio are permanently removed. Both ask for confirmation first and say that they can't be undone.
- There is no automatic purge: nothing in Recently Deleted is ever removed unless the user chooses to. (Decided 2026-10-18; a time-based purge would need a separate decision and a change to the deletion rules.)
- If a delete fails, an alert says so and the note stays.

### Search

Status: **Built** under the older concept (search by words and tags); **Planned** for notes.

- One field for words and tags, with tag chips under it. It looks in the body (so the title and tags too) of every note, and a result must have all selected tags. Results are newest first, grouped by month. Opening a result and going back returns to the results with the query and chips kept. It is plain text matching on the device, not analysis or interpretation.
- Recently Deleted notes are not searched. Open: where Search is entered from (the note list or the drawer).

### Settings

Status: **Built** (the switch exists under an older name); the new label is **Planned**.

- Opened from the drawer. One switch controlling whether the app opens a new note on the first launch each day, on by default, labelled "Open a new note on launch", with the line "When off, the app opens to the note list."
- When off, the app always opens to the note list and resume on a new day changes nothing. Backing out of an empty launch note and the "+" button are unaffected.
- The choice applies at once and is stored on the device only (one yes/no value in a small file). A damaged or missing file means on.

### Navigation

Status: **Built** for the gestures listed; the screen structure is **Planned**. The app keeps its current native-stack navigation setup.

- Android back on the note list exits the app. Back from any other screen returns to where the user came from.
- Drawer: opens from the left and closes by tapping outside it, swiping it closed, or Android back. Settings and Recently Deleted open from the drawer and go back to the list.
- Bottom sheets (the recording panel, the expanded voice note view) close by dragging down, tapping the dimmed backdrop, or Android back.
- Leaving a recording asks "Discard this recording?" ("Your recording will be deleted." with "Keep recording" and "Discard"). Discard stops the recording, deletes the unsaved recording, then leaves as it would have. If the recording cannot be stopped, the "Could not finish recording" alert shows and the user stays.
- Back is ignored while a delete started from the editor is in progress.

### Where notes are stored

Status: **Planned**.

- Notes are stored on the device only, in a notes index file (`notes.json`) with voice note audio in a `notes/` folder. Each note keeps its text, created and updated times, whether it is pinned, when it was deleted (if it is in Recently Deleted) and its voice notes. The title, preview, tags and the Todo flag are worked out from the text and never stored.
- The index is written safely (a temporary file, then replaced) and an unreadable index is never overwritten blindly. Storage rules for contributors are in `CLAUDE.md`.

## Retired terms and migration

Status: the import is **Planned**, not built yet.

These terms belong to the older concept and are retired. The older code (still present at this commit) saves only through a check button and asks "Save a draft?" or "Discard changes?" when leaving. They remain only in the older code and in the import until the cleanup chunk removes them; do not use them in new copy, code or data models.

| Retired term                             | Replaced by / fate                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Journal, Journals home                   | Gone. Tags organize notes.                                                                          |
| Entry, Life entry, Dream, Dream entry    | Note.                                                                                               |
| Dream log, Life log                      | The note list with a tag chosen in the drawer.                                                      |
| Emotion                                  | Gone as a field.                                                                                    |
| "No dream"                               | The day marker: backing out of the empty launch note counts as done for the day (see Launch above). |
| Add-entry page                           | The editor.                                                                                         |
| Custom journals, rename, delete journal  | Gone.                                                                                               |
| Draft, Save draft                        | Gone. A note exists once it has content; the editor autosaves. Drafts in old data become notes.     |
| Check button, "Discard changes?"         | Gone. No explicit save and no leave prompts (autosave).                                             |
| "Open dream capture on launch" (setting) | The launch switch in Settings, labelled "Open a new note on launch".                                |

Existing data is brought over by a read-only import of the older data file (`dreams.json`) and its audio into notes. The old files are never changed or removed. Each old entry becomes a note: the title becomes the first line, the text follows, the journal becomes a tag (for example `#dreams`, `#life`, or a custom journal's name made into a tag), the old emotion text is kept as a plain line in the body, and drafts become ordinary notes. Open: the exact layout of the imported text, whether old audio is referenced in place or copied, and the tag spelling for custom journal names are technical choices still to be made.

## Platforms

- **Mobile**: capture and daily use. This is the primary platform.
- **Desktop/tablet**: browsing, organizing and looking back over time. Later.

## Not in scope yet

Do not build these unless explicitly asked:

- Any AI features (classification, suggestions, summaries, pattern-finding)
- Tasks as a feature (due dates, reminders, completion tracking). The Todo view only lists notes that contain plain-markdown checkboxes.
- Nested tags
- Markdown beyond headings, bullets, numbered lists, checkboxes, bold and italic (no links, code, tables or images)
- Automatic purge of Recently Deleted
- Threads or other higher-level grouping beyond tags
- Periodic roundups or summaries
- An explore/hub view
- Desktop app

## Open decisions

These are undecided. Ask before assuming an answer.

- **Closing a stored voice note under autosave.** Closing used to delete the audio only on an explicit save, and could be undone. With autosave a close is immediate. Options: (a) closing moves the recording to a hold area until the note is left, with undo until then; (b) closing removes it from the note but the file stays and is only deleted via Delete forever of the note; (c) confirm before removing a stored voice note.
- How "on waking" is detected: for now "first open with nothing done today, or a resume on a new day" stands in for it, with the Settings toggle to turn it off. A time window is not built.
- How markdown is shown in the editor, and whether there is also a rendered reading view with tap-to-toggle checkboxes (a technical decision for the architect).
- Whether pinned notes sort first in the main list, whether the drawer shows every tag, and where Search is entered from.
- Whether transcribing a voice note into text after recording works well enough on device (needs a device test).
