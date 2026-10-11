# Product: Lucid

This document describes what the app is and the decisions made so far. Read it before working on features, UI, or copy. If something you're asked to build conflicts with this doc, raise it instead of guessing.

## What it is

A mobile-first personal journal with two kinds of writing:

- **Life entries**: everyday writing about what happened and what's on the user's mind.
- **Dreams**: capturing dreams right after waking.

The app holds several journals. Two are built in, Dreams and Life, the user can add their own, and each entry lives in one of them.

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

| Term           | Meaning                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal        | A container of entries. The app has two built-in journals, Dreams and Life, plus any the user creates (custom journals). Every entry lives in one journal.                                                                |
| Entry          | One piece of writing in a journal. Existing dreams are entries of type Dream in the Dreams journal.                                                                                                                       |
| Life entry     | A free-form daily writing entry, kept in the Life journal. (Formerly called a "Journal entry".)                                                                                                                           |
| Dream          | A dream capture, usually made right after waking.                                                                                                                                                                         |
| Title          | A short name the user gives a dream so it can be found later. Required to finish a dream (a Draft needs no title).                                                                                                        |
| Emotion        | Free text about how a dream felt. No longer entered on the add-entry page (dropped, 2026-10-11); emotions saved earlier are kept and shown on the entry and in the logs.                                                  |
| Tag            | A label the user applies to entries (dreams and Life entries), written in the body as a `#word`.                                                                                                                          |
| No dream       | Backing out of the empty launch page, for a morning with nothing to record. Counts as done for the day: the app then opens to Today, not the Dreams page, for the rest of that day.                                       |
| Today          | The main screen: lists only today's entries, from every journal (drafts included), newest first, with a "+" button to start an entry or a new journal.                                                                    |
| Draft          | An entry saved with "Save draft" (on the leave prompt) that is not finished yet. Needs nothing but something on the page (a brand-new entry with nothing at all is simply not kept).                                      |
| Transcript     | The text of an entry: the body of the add-entry page, typed by the user (stored as `transcript`). Transcribing a voice note into it after recording is planned, not built.                                                |
| Dream log      | The screen that lists the Dreams journal's dreams and drafts by month, with a tag filter and search.                                                                                                                      |
| Life log       | The same kind of screen for the Life journal: its entries and drafts by month, with a tag filter and search.                                                                                                              |
| Journals home  | The screen with a card for each journal. Tapping a card opens that journal's log.                                                                                                                                         |
| Search         | Search across all journals at once, by words and tags. Entered from the Journals home.                                                                                                                                    |
| Add-entry page | The single page that creates and edits an entry in any journal: journal picker, title, body (with tags written in it), optional voice notes, and a toolbar. It replaces the old Capture, Read it back and Review screens. |
| Voice note     | An audio recording attached to an entry (an entry can have several), shown as a card above the title with play, a waveform and a close button.                                                                            |
| Dream entry    | One finished dream shown for reading: date, title, emotion, the recordings and the transcript, with its tags highlighted in the text. Opened from the Dream log.                                                          |

Tags cover anything the user wants to track over time, such as a recurring dream image ("water"), strong emotional reactions, or something practical like "agent mistake." Seeing everything under one tag over time is the main way patterns show up, and it is now possible through the Dream log's tag filter and search. There is no separate "tracker" concept; tags fill that role.

## Core behavior (v1)

### Morning dream capture

- When the user opens the app and has not yet created a finished dream today or backed out of the launch page today ("No dream"), it opens to the add-entry page for the Dreams journal (unless "Open dream capture on launch" is turned off in Settings; see Navigation and Settings). Once a finished dream is created today or "No dream" is counted, the app opens to Today for the rest of that day.
- The launch page can always be dismissed with one tap: its back arrow (and Android back) while the page is empty counts as "No dream": the marker is written, the app lands on Today, and the launch page does not reappear that day. There is no confirmation and no separate "No dream" button. With something on the page, back asks the usual "Save a draft?" question and does not count as "No dream". A saved draft does not count as done, so the launch page opens again next launch.
- "No dream" counts as done for the day. The app remembers only the latest date it was counted, in a small file on the device. Nothing leaves the phone.
- Audio recordings are kept alongside the text (an entry written without a voice note has no audio).
- Starting must be fast: the page opens with the title focused and the voice note one tap away, since dreams fade within minutes.
- The screen should be calm and low-glare (dark), suitable for use right after waking.

### The add-entry page

- One page creates and edits every entry (a new entry, a reopened draft, an edit of a saved entry), in any journal. Top bar: a back arrow, the **journal picker** (a pill with a dropdown) and a **check** that saves. Under it: the date, optional **voice note cards**, the **title** and the **body**, where tags are typed as `#words`. At the bottom, above the keyboard when it is open, a **toolbar**: undo, redo, record a voice note, and "#" for tags; above it, while a tag is being typed, a row of tag suggestions.
- **Journal picker.** A new entry starts in the journal chosen from the "+" sheet or the log it was started from (Dreams on launch), and can be switched until it is first saved. A reopened draft and a saved entry never move journals. The check follows the picked journal: a Dream needs a title, other journals do not.
- **Voice note.** The mic in the toolbar records right on the page (a red dot, the time and a stop button; no pause). When it stops, a card appears above the title: play/pause, a waveform that fills in as the note plays, its length, and a close button. The mic stays available, so an entry can hold several notes (no limit); the cards stack in the order recorded and only one plays at a time. The notes are kept with the entry when it is saved. The app does not yet turn the note into text: the body is typed (transcribing after recording is planned; there is no live text while recording).
- **Closing the voice note.** Each card's close button removes that note from the entry, but nothing stored is deleted until the entry is saved, and the close can be undone. Saving after closing a note that was stored removes that recording from the phone for good (the entry, its text and its other notes stay); saving after closing a new note simply does not keep it. Leaving without saving deletes nothing that was already stored.
- **Undo and redo** cover typing in the body (tags included, since they are body text) and closing a voice note (one history, most recent first). They do not cover the title or the journal. They are off while recording or saving.
- **Tags** are optional and are written in the body: a `#` followed by a word (for example `#water`) is a tag, shown highlighted as it is typed, and saving derives the entry's tags from these words (lowercase, each once). The "#" button types a `#` at the cursor. While a tag is being typed, a row above the toolbar suggests tags the user has used before and tags already in this entry; tapping one completes the word. Nothing is derived from the content beyond what the user typed. A tag is one word (no spaces); an older tag with spaces or punctuation shows as a hyphenated `#tag` line added at the end of the text when the entry is opened (one undo step). Removing the word removes the tag when the entry is saved. Emotion is not on the page.
- **Leaving.** The back arrow (and Android back) closes an empty new page at once. A new entry or draft with something on it (a title, text, a voice note) asks "Save a draft?" with Save draft, Discard and Keep writing; nothing is stored until a choice is made. An edit with changes asks "Discard changes?" (Keep editing / Discard); an edit without changes just returns. While recording, back first asks "Discard this recording?" (Keep recording / Discard), and Discard deletes the unsaved recording and then carries on leaving.
- **Check.** It saves a finished entry (a Dream needs a title) and goes where the page was started from (see Navigation). It is off while recording or saving. On an edit with no changes it just returns to the entry.
- Emotion stays free text in storage, never a fixed list or rating, but the page no longer asks for it.

### Dream log

- The Dream log lists the Dreams journal's dreams, newest first, grouped by month, under the header "Dreams". It has a back arrow to the Journals home.
- Each dream is a row with its day, title, a two-line preview of the transcript, and chips for how it felt and its tags. Rows have no play button; the recording is played from the Dream entry.
- Drafts appear in the same list, by date, as an outlined card: the title (or "Untitled dream", followed by the recording length when there is audio), then "Draft · <date>" (for example "Draft · Oct 4") with "Draft" in red. Tapping a draft reopens it on the add-entry page.
- A row of tag chips ("All" and each tag with its count) filters the list. The user can select several tags, and a dream must have all of the selected tags to be shown. The row shows the most-used tags (up to 20); other tags can still be found through search.
- Search looks for the typed words in a dream's title, transcript, emotion and tags. It is plain text matching on the device, not analysis or interpretation of dreams.
- A finished dream row can be swiped left to reveal a red "Delete". Tapping it asks the same "Delete this dream?" confirmation as the Dream entry (see below). Drafts swipe and delete the same way (a draft row has no chevron). Screen readers get a "Delete" action on every row instead of the swipe.
- A "New dream" button opens the add-entry page. When there are no dreams, or nothing matches, the screen says so.
- The filter, the search and the scroll position are kept when the user opens a dream and comes back. The Dream log and the Life log share one filter and search view, which starts fresh whenever the other journal's log is opened.

### Dream entry

- Tapping a finished dream opens its Dream entry: a centered header "Dream · <date>" (for example "Dream · Sunday, October 4"; "Life · …" in the Life journal; just the journal name with no date), the title, all of its emotions as chips, a compact player for each recording when the dream has audio, and the transcript in paragraphs with its `#tags` highlighted ("No text yet" when there is none; tags that an older entry has but its text lacks are shown as a `#tag` line after the text).
- A "..." (More options) menu at the top right holds **Edit** and **Delete** (Delete in red).
- **Edit** opens the add-entry page for that entry (title, body with its tags, and voice notes; the journal cannot change). The check saves the changes and returns to the entry; with no changes it just returns. Going back with unsaved changes asks "Discard changes?". A finished dream is never turned into a draft.
- **Delete** (in the "..." menu here, or by swiping a row in the Dream log, draft or finished) works on any entry. It asks "Delete this dream?" / "The recording and text will be permanently deleted. This can't be undone." (Keep / Delete); a dream with no recording says "The text will be permanently deleted. This can't be undone." Deleting is permanent: no trash and no undo. The recording, the text and any saved copy of the dream are removed, and, when deleted from the entry, the app returns to the Dream log with its filter, search and scroll kept (a delete from the log just removes the row). If the delete fails, an alert says so and the dream stays.

### Journals

- A journal is a container. The built-in journals are **Dreams** (everything captured as dreams so far) and **Life** (everyday entries). Entries are written chronologically within a journal, and an entry never moves to another journal when edited.
- The **Journals home** shows a card for each journal, Dreams first, with a quiet count of finished entries ("12 dreams", "5 entries"; drafts are not counted). It has a search button, a back arrow to Today and the same "+" add-entry button and sheet as Today (see Today). Tapping a card opens that journal's log.
- The **Life log** works like the Dream log (month groups, tag filter, search, swipe to delete, an entry screen with Edit and Delete) under the header "Life", with a "New entry" button.
- **Life entries** use the same add-entry page as dreams. Differences: the check is "Save entry", there is no "No dream" (only an empty launch page counts), and a back arrow returns to where the page was started (the Life log, or Today). The title is optional (an untitled finished entry shows the start of its body in the log, in the title's place, because the date is already in the row's date column, and "Untitled entry" if it has no body; its entry screen shows no heading above the text (the header carries the date); a draft shows "Untitled entry"; Dreams are unchanged), and tags are optional as for dreams. Dreams still need a title.
- **Custom journals.** The user can create their own journals ("New journal" at the bottom of the "+" sheet, on Today or the Journals home; see Today). The name is 1 to 24 characters and must be unique, ignoring capitals, among all journals including Dreams and Life; a name can be reused after its journal is deleted. A custom journal works like Life: the title is optional, and its log, entry date line ("<Name> · <date>"), search label and empty state use the journal's name. There are no icons or colors, journals keep creation order (after Dreams and Life) and there is no limit on how many. After creating one, its empty log opens with "New entry".
- **Rename.** On the Journals home, swiping a custom journal's card reveals **Rename** (and **Delete**). Rename opens a sheet titled "Rename journal", prefilled with the name, with "Save"; only the name changes. Dreams and Life cannot be renamed or deleted.
- **Delete journal.** Swiping a custom card and tapping **Delete** asks `Delete "<name>"?` with the entry count (drafts included, recordings mentioned when there are any) and says it can't be undone. Deleting removes every entry in the journal and their audio, permanently. While it runs, the card is greyed and reads "Deleting..." and the journal's entries are hidden everywhere. If it fails, an alert says how many entries were deleted and how many remain, and the journal stays listed; the journal itself is removed last, so entries are never left without it.
- **Search** (from the Journals home) is one field for words and tags, with tag chips under it. It looks in titles, transcripts, emotions and tags of every journal at once, and a result must have all selected tags. Results are mixed, newest first, grouped by month, each marked with its journal. Only finished entries are searched: drafts are not included. Opening a result and going back returns to the results with the query and chips kept.
- **Navigation:**
  - **Launch rule.** If no finished dream was created today and no "No dream" is recorded for today and "Open dream capture on launch" is on (the default), the app opens to the add-entry page for Dreams. Otherwise it opens to Today. The app waits briefly for its stored data before deciding, with a cap of 1000 ms: if the data is not ready by then, it opens the Dreams page so capturing is never delayed. Backing out of the launch page while it is empty, with the back arrow or Android back, counts as "No dream" for the day (see Morning dream capture).
  - Saving, and Save draft, from the launch page open Today.
  - **Where the page returns.** A page started from the "+" sheet (on Today or the Journals home) returns to Today after a save and on back. A page started from a log ("New dream" or "New entry") returns to that log. Only the launch page counts an empty back as "No dream". A draft opened from Today returns to Today; from a log, to that log. Saving an edit returns to the entry, which keeps its origin (Today, a log or Search); deleting from an entry returns to where it was opened.
  - **Today.** It has a book icon at the top left (Open Journals), the title and date, and a gear at the top right (Open Settings). Android back on Today exits the app. Tapping a finished entry opens it, and back returns to Today. Tapping a draft reopens it on the add-entry page.
  - **Journals home** is reached from the book icon on Today. It has a back arrow, and Android back goes to Today. A log's back arrow goes to the Journals home (when the log's search field is open, back closes it first). Search is entered from the Journals home and its back goes there.
  - **Settings** is reached from the gear on Today. Its back arrow and Android back return to Today.
  - Leaving Search resets it.
  - **Leaving a recording.** While recording, back (the arrow or Android back) asks "Discard this recording?" ("Your recording will be deleted." with "Keep recording" and "Discard"). Discard stops the recording, deletes the unsaved recording, then leaves as it would have: an empty launch page counts as "No dream" and opens Today; a page with text asks its usual "Save a draft?"; any other page returns to Today or the log it was opened from, with no "No dream" marker. If the recording cannot be stopped, the "Could not finish recording" alert shows and the user stays.
  - **Resume on a new day.** When the app comes back to the foreground on a different day than it left on, and nothing is done today, and "Open dream capture on launch" is on, it jumps to the launch Dreams page. It never does this while the user is on the add-entry page (or while an entry is being saved or deleted), and never when midnight passes while the app is open (Today just shows the new day). It happens at most once per new day: if it was blocked because the user was mid-flow, it does not happen again that day.

### Today

- Today shows only entries created today, from any journal (drafts included), newest first, in one list. Rows are flat, screenshot-style items (no cards), separated by hairlines, with one more hairline after the last. Each has a small uppercase label, "DREAM · 6:22 AM" or "LIFE · 6:22 AM" (the time is when the entry was first saved), a large serif title (none for an untitled Life entry), the full body (never cut short, however long), then outlined chips for all its emotions followed by its tags (no "+N"). A draft uses the same frame with a red "DRAFT" in the label, no body, and tapping it reopens it on the add-entry page. Rows swipe to delete like in the logs; the Dream log, Life log and Search rows are unchanged. Which day an entry belongs to follows when it was first stored, in the device's local time.
- If "No dream" was chosen today and there is no dream or draft today, a quiet "No dream today" line shows. With nothing at all, it says "Nothing here yet today." ("Nothing else yet today." under the "No dream today" line).
- A round "+" floating button at the bottom right opens a bottom sheet headed "Add entry", with one row per journal (Dreams, then Life, then custom ones) styled like the cards on the Journals home; tapping a row starts a new entry on the add-entry page, and a save or back returns to Today. Tapping the dimmed backdrop, or Android back, closes the sheet; it also closes if a delete starts. Below the journal rows, set apart by a rule, a "New journal" row opens a sheet to name it ("Create" / "Cancel"); the name rules show as the user types. Custom journals get a row each, in creation order. The Journals home has the same button and sheet: picking a journal starts an entry that returns to Today (on back, on leaving and after a save), not to the Journals home, and "New journal" creates the journal and opens its empty log. The button is hidden while a name sheet (new or rename) is open and disabled while a journal delete runs. The logs keep their own "New dream" / "New entry" buttons. There is no search on Today; search is on the Journals home.
- Whether today is done is worked out from the saved dreams and the "No dream" date, so deleting today's only finished dream makes the next launch open the Dreams page again.

### Settings

- Opened from the gear on Today. One switch, **Open dream capture on launch**, on by default, with the line "When off, the app opens to Today."
- When off, the app always opens to Today and resume on a new day changes nothing. Backing out of an empty launch page and "New dream" are unaffected.
- The choice applies at once and is stored on the device only (one yes/no value in a small file). A damaged or missing file means on.

#### Planned, not built

- A floating "+" add button in the logs, as another way to add entries (idea; Today already has one).

### Where journals are stored

- The list of custom journals is kept in a small file on the device (`journals.json`); Dreams and Life are built in and not stored. Journal names never leave the phone. The file is written safely and the app never deletes it. Entries keep their journal's id, and an entry whose journal is not in the list is kept but hidden.
- Downgrade: a build from before journals existed ignores which journal an entry is in, so it shows custom-journal entries (and Life entries) as dreams; a build that knows Dreams and Life but not custom journals hides custom-journal entries. The data is preserved either way and shows correctly again in a build that knows custom journals.

### Tags

- Tags apply to every entry, in any journal, and are shared across journals: suggestions come from all of them, and Search finds tags across journals.
- Tagging is optional and lightweight.
- In a log the user can filter its entries by one or more tags (all selected tags must match) and search by text; Search does the same across all journals.

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

Resolved (2026-10-11): one add-entry page replaces the voice-first capture; voice is an optional note attached to an entry, and text is typed. Whether and how a voice note becomes text after recording is open (planned, needs a device test).

These are undecided. Ask before assuming an answer.

- How "on waking" is detected: for now "first open with nothing done today, or a resume on a new day" stands in for it, with the Settings toggle to turn it off. A time window is not built.
- Journal structure is partly resolved (see Journals and Today): an add button in logs is still to be designed and needs the user's go-ahead (user-created journals are built). How the app should navigate in the long run (Expo Router or the current state switch) is undecided.
