# Product: Lucid

This document describes what the app is and the decisions made so far. Read it before working on features, UI, or copy. If something you're asked to build conflicts with this doc, raise it instead of guessing.

## What it is

A mobile-first personal journal with two kinds of writing:

- **Life entries**: everyday writing about what happened and what's on the user's mind.
- **Dreams**: capturing dreams right after waking.

The app holds several journals. Two are built in, Dreams and Life, and each entry lives in one of them.

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

| Term          | Meaning                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal       | A container of entries. The app has two built-in journals, Dreams and Life; user-created journals are planned for later. Every entry lives in one journal.          |
| Entry         | One piece of writing in a journal. Existing dreams are entries of type Dream in the Dreams journal.                                                                 |
| Life entry    | A free-form daily writing entry, kept in the Life journal. (Formerly called a "Journal entry".)                                                                     |     |
| Dream         | A dream capture, usually made right after waking.                                                                                                                   |
| Title         | A short name the user gives a dream so it can be found later. Required to finish a dream (a Draft needs no title).                                                  |
| Emotion       | Free text about how a dream felt, entered like tags. Optional, never a fixed list or rating.                                                                        |
| Tag           | A label the user applies to entries (dreams and Life entries).                                                                                                      |
| No dream      | The one-tap option on dream capture for a morning with nothing to record. Intended to count as done for the day (not built yet: today it only opens the Dream log). |
| Draft         | A dream saved with "Finish later" that is not finished yet. Needs nothing to be saved (a brand-new dream with nothing at all is simply not kept).                   |
| Transcript    | The text of a dream, from live on-device speech recognition or typed. The user can edit it.                                                                         |
| Dream log     | The screen that lists the Dreams journal's dreams and drafts by month, with a tag filter and search.                                                                |
| Life log      | The same kind of screen for the Life journal: its entries and drafts by month, with a tag filter and search.                                                        |
| Journals home | The screen with a card for each journal. Tapping a card opens that journal's log.                                                                                   |
| Search        | Search across all journals at once, by words and tags. Entered from the Journals home.                                                                              |
| Dream entry   | One finished dream shown for reading: date, title, emotion, tags, the recording and the transcript. Opened from the Dream log.                                      |

Tags cover anything the user wants to track over time, such as a recurring dream image ("water"), strong emotional reactions, or something practical like "agent mistake." Seeing everything under one tag over time is the main way patterns show up, and it is now possible through the Dream log's tag filter and search. There is no separate "tracker" concept; tags fill that role.

## Core behavior (v1)

### Morning dream capture

- When the user opens the app on waking, it opens to the dream capture screen.
- Dream capture can always be dismissed with one tap via "No dream".
- Planned (Part 2, not built): once a dream is saved or "No dream" is chosen for the day, the app opens to the Today page instead (see Journals). Today the app always opens to dream capture, and "No dream" opens the Dream log.
- Audio recordings are kept alongside transcripts (a dream written with "Write instead" or "Type instead" has no audio).
- Dream capture must be fast: the user should be able to start capturing immediately, since dreams fade within minutes.
- The screen should be calm and low-glare (dark), suitable for use right after waking.

#### After recording: Read it back, then Review

- When recording ends, the user sees **Read it back**: the transcript in an editable text box, with the original recording kept and playable below the text box (hidden while the keyboard is up). The user can fix anything that came out wrong.
- **Continue** goes to **Review**: a title (required to finish), how it felt (optional; emotions the user types in, like tags) and tags (optional). The transcript shows there as a short preview with an Edit link back to Read it back.
- Nothing is permanently saved until the user taps **Done** or **Finish later**.
- **Done** finishes the dream and needs a title. **Finish later** saves a draft and needs nothing. A draft appears in the Dream log as "Draft", and tapping it reopens Review.
- The back arrow on Read it back discards an unsaved recording, after a confirmation ("Discard this dream?"). There is no "Delete and record again".
- **Write instead** (on dream capture) opens Read it back with an empty text box and creates a dream with no audio.
- **Type instead** (on the listening screen, while recording or paused) lets a dream that started as a recording become a written dream. After a confirmation ("Your recording will be deleted. The text so far is kept."), the recording is deleted and Read it back opens with the text captured so far, ready to edit, and no audio.
- Emotion stays free text, never a fixed list or rating: the user creates each emotion by typing it in an input, the way tags work, and added emotions show as chips (with a capital first letter). Quick-pick suggestions are made from emotions the user has used before. Tag suggestions come from tags the user has used before. Nothing is derived from the content of a dream.
- Once finished, the user sees the Dream log.

### Dream log

- The Dream log lists the Dreams journal's dreams, newest first, grouped by month, under the header "Dreams". It has a back arrow to the Journals home.
- Each dream is a row with its day, title, a two-line preview of the transcript, and chips for how it felt and its tags. Rows have no play button; the recording is played from the Dream entry.
- Drafts appear in the same list, by date, as an outlined card: the title (or "Untitled dream", followed by the recording length when there is audio), then "Draft · <date>" (for example "Draft · Oct 4") with "Draft" in red. Tapping a draft reopens Review.
- A row of tag chips ("All" and each tag with its count) filters the list. The user can select several tags, and a dream must have all of the selected tags to be shown. The row shows the most-used tags (up to 20); other tags can still be found through search.
- Search looks for the typed words in a dream's title, transcript, emotion and tags. It is plain text matching on the device, not analysis or interpretation of dreams.
- A finished dream row can be swiped left to reveal a red "Delete". Tapping it asks the same "Delete this dream?" confirmation as the Dream entry (see below). Drafts swipe and delete the same way (a draft row has no chevron). Screen readers get a "Delete" action on every row instead of the swipe.
- A "New dream" button opens dream capture. When there are no dreams, or nothing matches, the screen says so.
- The filter, the search and the scroll position are kept when the user opens a dream and comes back. The Dream log and the Life log share one filter and search view, which starts fresh whenever the other journal's log is opened.

### Dream entry

- Tapping a finished dream opens its Dream entry: the date and time (for example "Sunday, October 4 · 6:42 AM"), the title, all of its emotion and tags as chips, a compact player when the dream has audio, and the transcript in paragraphs ("No text yet" when there is none).
- A "..." (More options) menu at the top right holds **Edit** and **Delete** (Delete in red).
- **Edit** reopens Review for that dream (title, how it felt, tags, and the transcript through Read it back). A finished dream has no "Finish later". **Done** saves the changes and returns to the entry; with no changes it just returns. Going back with unsaved changes asks "Discard changes?".
- **Delete** (in the "..." menu here, or by swiping a row in the Dream log, draft or finished) works on any entry. It asks "Delete this dream?" / "The recording and text will be permanently deleted. This can't be undone." (Keep / Delete); a dream with no recording says "The text will be permanently deleted. This can't be undone." Deleting is permanent: no trash and no undo. The recording, the text and any saved copy of the dream are removed, and, when deleted from the entry, the app returns to the Dream log with its filter, search and scroll kept (a delete from the log just removes the row). If the delete fails, an alert says so and the dream stays.

### Journals

- A journal is a container. The built-in journals are **Dreams** (everything captured as dreams so far) and **Life** (everyday entries). Entries are written chronologically within a journal, and an entry never moves to another journal when edited.
- The **Journals home** shows a card for each journal, Dreams first, with a quiet count of finished entries ("12 dreams", "5 entries"; drafts are not counted). It has a search button and no back arrow. Tapping a card opens that journal's log.
- The **Life log** works like the Dream log (month groups, tag filter, search, swipe to delete, an entry screen with Edit and Delete) under the header "Life", with a "New entry" button.
- **Life entry capture** is the same as dream capture: voice first, live transcript, then Read it back and Review, with "Write instead" and "Type instead". Differences: the headline is "What happened today?" with its own tips ("Start anywhere", "Say it as it comes", "Note how you felt", "Keep it short or long"), there is no "No dream" button, the button to finish is "Save entry", and a back arrow returns to the Life log. The title is optional (the field says "Title (optional)"; an untitled finished entry shows the start of its body in the log, in the title's place, because the date is already in the row's date column, and "Untitled entry" if it has no body; its entry screen shows no date line or heading above the text; a draft shows "Untitled entry"; Dreams are unchanged), and Emotion and tags are optional as for dreams. The date line on Read it back, Review and Edit is "Life · <date>" (just "Life" with no date), as Dreams show "Dream · <date>". Dreams still need a title.
- **Search** (from the Journals home) is one field for words and tags, with tag chips under it. It looks in titles, transcripts, emotions and tags of every journal at once, and a result must have all selected tags. Results are mixed, newest first, grouped by month, each marked with its journal ("Dreams" or "Life"). Only finished entries are searched: drafts are not included. Opening a result and going back returns to the results with the query and chips kept.
- **Navigation:**
  - The app opens to Dream capture. Saving a dream opens the Dream log; "No dream" also opens the Dream log. Saving a Life entry opens the Life log. Saving an edit returns to the entry, which keeps its origin (a log or Search).
  - A log's back arrow goes to the Journals home (when the log's search field is open, back closes it first). Dream capture has no "Journals" link and no back arrow.
  - The Journals home has no back arrow; Android back there exits the app, as it does on Dream capture.
  - Leaving Search resets it. An entry opened from Search returns to Search; deleting from an entry returns to where it was opened.
  - On Life capture, Android back does nothing while a recording is running.

#### Planned, not built

- **Today page** (Part 2): the app's main hub. It shows only entries from today, from any journal; if "No dream" was chosen, no dream is shown. The app opens to Today when something has been saved or skipped today, otherwise to dream capture.
- A floating "+" add button in a log, as another way to add entries (idea).
- **User-created journals**: create, rename and delete. Deleting a journal raises a data-control question (what happens to its entries), to be decided with the user first.

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

Resolved: dream capture leads with voice, and "Write instead" is the secondary option.

These are undecided. Ask before assuming an answer.

- How "on waking" is detected (time window, first open of the day, user setting)
- Journal structure is partly resolved (see Journals): the Today page, an add button in logs and user-created journals are still to be designed and need the user's go-ahead. How the app should navigate in the long run (Expo Router or the current state switch) is undecided.
