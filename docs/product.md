# Product: Lucid

This document describes what the app is and the decisions made so far. Read it before working on features, UI, or copy. If something you're asked to build conflicts with this doc, raise it instead of guessing.

**Status of this document (2026-10-18).** The concept below (notes organized by tags) was decided on 2026-10-18 and is built on the branch `feat/notes-model`. It is not merged to `main`, and none of it has been verified on a device yet. The older concept (separate title field, containers for writing, an explicit save step; see Retired terms) is gone from the app; only the one-time import of old data remains. The markdown work (styled editing, the reading view, links, images and `[[note]]` links; 2026-10-21) is built on the branch `feat/markdown`, also not merged and not verified on a device. Each section carries a status line: **Built** means the code does it and Jest covers it (not verified on a device unless a line says so); **Planned** means decided but not built yet; **Open** means undecided (ask before assuming).

## What it is

A mobile-first, voice-first note app. The user writes notes in markdown, attaches voice notes to them, and finds them again through tags. There are no folders or containers: tags are the only organization.

Capturing something quickly, by voice or by typing, is the core. The first launch each day opens a new note so the user can capture straight away.

## Principles

- **Notes first.** Version one is a notes app. There are no AI features in v1.
- **Insight comes from the user.** The app helps the user capture, organize and revisit. It does not interpret, analyze or tell the user what their notes mean.
- **Open structure that guides.** The only structure is what the user writes: the first line is the title, and `#words` are tags. Nothing is a fixed list, scale or rating, and nothing is required.
- **Low friction.** Capturing should never feel like data entry. No streaks, no scores, no gamification.
- **On-device by default.** Notes stay on the phone and no note text is sent anywhere. Transcription runs on the device; audio leaves the phone only if the user turns on "Transcribe voice notes online" (off by default), and then goes to Apple or Google. Otherwise the only things that contact another party are an image written in a note, which is fetched from its website only when the user allows it, and a web link, which opens in the browser only when the user taps it (see Notes and markdown, Privacy).
- **Plain language.** The app never uses psychological or Jungian terms in UI copy, and never presents anything as psychological interpretation. The older text's Jungian-inspired framing is dropped and stays dropped.

## Vocabulary

Use these terms consistently in UI copy, code and data models. Status: **Built** (the code, the copy and the data model use these terms; the older terms survive only as listed under Retired terms).

| Term             | Meaning                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note             | One piece of writing: markdown text (the body) with optional voice notes. Everything the user writes is a note.                                                                                                                 |
| Title            | The first line of the body, without its markdown markers. Derived, never stored separately. Shows as "Untitled" when the first line is empty, only a tag, a rule (`---`), a code fence line, or an image with no alt text.      |
| Tag              | A label written in the body as `#word`. Flat: no nesting (`#a/b` is not a hierarchy). Derived from the body on read, never stored separately. A `#word` inside code or inside a link address is not a tag.                      |
| Body             | The markdown text of a note, including its first line.                                                                                                                                                                          |
| Voice note       | An audio recording attached to a note (a note can have several), shown as a card with play, a waveform and a close button; tapping a card opens the expanded view.                                                              |
| Transcript       | The text of a voice note produced by on-device transcription, added to the body. A new voice note is transcribed automatically after recording, on the device only (not verified on a device).                                  |
| Today view       | A smart view in the drawer: notes written or edited today (updated or created on the local day). Pinning and restoring do not count as an edit.                                                                                 |
| Todo view        | A smart view: notes that contain at least one checkbox line.                                                                                                                                                                    |
| Untagged view    | A smart view: notes with no tag.                                                                                                                                                                                                |
| Pinned           | A smart view of the notes the user pinned; also the act of pinning a note.                                                                                                                                                      |
| Recently Deleted | Where a deleted note goes. The user can restore it or delete it forever.                                                                                                                                                        |
| Drawer           | The left-hand panel: a dropdown of smart views (which also holds Recently Deleted, the only way to it from the drawer), the list of tags, and a footer with a Settings gear (bottom left) and a tag sort button (bottom right). |
| Search           | Search by words and tags across all notes.                                                                                                                                                                                      |

Tags cover anything the user wants to track over time, such as a recurring theme or something practical like "agent mistake." Seeing everything under one tag over time is the main way patterns show up. There is no separate "tracker" concept; tags fill that role.

## Core behavior (v1)

### Notes and markdown

Status: **Built** (the body is one markdown text field with styled editing and a separate reading view; no separate title field). Not verified on a device: every statement in this section is covered by Jest only.

- A note is markdown text. The first line is the title. If the first line is empty or only a tag, the title shows as "Untitled". The title is never stored; it is read from the body each time. Markers are not part of the title: `### x` gives the title "x", `[Foo](u)` gives "Foo", `[[Foo]]` gives "Foo", and a first line that is only a rule (`---`), a code fence or an image with no alt text is "Untitled".
- **Markdown scope:** headings 1 to 3 (`#`, `##`, `###`), bold (`**x**`), italic (`*x*`), bullets (`- ` or `* `), numbered lists (`1. `), checkboxes (`- [ ]` and `- [x]`), a horizontal rule (three or more `-`, `*` or `_` of one kind on a line, optionally separated by spaces, with up to three leading spaces: `---`, `***`, `___`, `- - -`), inline code (`` `x` ``), code blocks (fenced with three backticks), links (`[text](url)`), images (`![alt](url)`) and links to other notes (`[[note]]`). Block quotes (`>`) are styled in the editor and drawn with a bar in the reading view, one line at a time, but are not otherwise supported (no nesting, no multi-line quote). Nothing else is rendered.
- Checkboxes are plain markdown text. There are no task features: no due dates, reminders, assignment or completion tracking. The Todo view simply lists notes that contain checkboxes; a `- [ ]` line inside a fenced code block is code and does not count.
- Tags are written in the body as `#word`, one word each, no spaces, no nesting, and are shown highlighted as they are typed. Tags are not stored separately: they are read from the body. Nothing is derived from the content beyond what the user typed. A `#word` inside inline code, a fenced code block, the address part of a link or image, or the text of a `[[note]]` link is not a tag.
- **Two modes.** A note is either being edited or being read.
  - **Editing** shows the text field with the markdown styled as it is typed (sized headings, bold, italic, dimmed markers, monospace code, underlined links), and the keyboard up.
  - **Reading** shows the note rendered, with no keyboard: headings, lists, checkboxes the user can tap to check and uncheck, rules, code blocks, tappable links, tappable `[[note]]` links and images. Markers such as `**` and the brackets and address of a link are not shown, and no web address is ever shown in the reading view (a link shows its text only).
  - A stored note opens in reading; a new note opens in editing. There is no Edit or Done button. In reading, a tap on the note's text or on the empty space below it starts editing (a horizontal rule line itself, and the bar of a block quote, are not tap targets): a tap on a line puts the caret at the end of that line, and a tap on the empty space below the content (the "Edit note" tap area at the end of the reading view) puts it at the end of the note. The caret always lands there; it does not return to an earlier position. Links, checkboxes and the "Tap to load" and retry image buttons keep their own actions and do not start editing. Taps while the note is locked or recording are ignored. The toolbar shows only while editing. Its **Hide keyboard** button hides the keyboard, saves and returns to reading; the keyboard hiding any other way also returns to reading, except while the list controls stand in for the keyboard (see the editor page below). With a hardware keyboard, where no keyboard event arrives, the note stays in editing until the user taps Hide keyboard. Undo and redo are available only while editing; a mistaken checkbox toggle in reading is fixed by tapping the checkbox again, or by tapping into the note and pressing undo.
- **Links.** A `[text](url)` link in the reading view opens in the system browser when tapped, and only if the address starts with `http://` or `https://`; any other kind of address (`mailto:`, `javascript:`, a relative path, and so on) is shown as plain text; tapping it does not open anything and instead starts editing the line, like tapping any other text. If the system cannot open it, an alert says "Couldn't open this link". Links are inert while a recording is open or a save or delete is running.
- **Note links (`[[note]]`).** Writing `[[Title]]` links to the note whose title is Title.
  - A link matches a note's title (its first line) ignoring upper and lower case and extra whitespace. Accents are not folded: "Café" and "Cafe" are different titles. Notes in Recently Deleted are not matched.
  - When several notes have the same title, the most recently edited one wins.
  - Tapping a link to an existing note opens it in the same screen (the current note is saved first). Tapping a link to a note that does not exist creates one whose first line is the link text and opens it; the usual empty-note rule applies (a note left empty is not kept, and a stored note that is emptied goes to Recently Deleted). In the reading view a link to an existing note is underlined, a link to a missing one is italic, and both are accent coloured. A link whose text would make an "Untitled" note (empty, or only a tag such as `[[#x]]`) opens nothing; in the reading view the tap starts editing the line. Tapping a link to the note you are already in does nothing.
  - Links are not updated when a note's title changes: the old `[[Title]]` then points at nothing, and tapping it creates a new note.
  - The text between `[[` and `]]` cannot contain `[` or `]`, and is at most 200 characters. The pipe form `[[a|b]]` is not an alias: the whole `a|b` is the target.
  - **Picker.** While typing after `[[`, a list of note titles appears above the keyboard (most recently edited first when nothing is typed after `[[`; otherwise titles starting with the typed text, then titles containing it; at most four rows are visible and the list scrolls). Tapping a title writes `[[Title]]` and puts the caret after the `]]`; the keyboard stays up. Titles that contain `[` or `]`, the open note's own title, and titles longer than 200 characters (after trimming) cannot be written as a link and are not offered. A link typed by hand to such a title is a link only if the text between the brackets, trimmed, is 200 characters or fewer; it then resolves if it matches the title after whitespace collapsing.
  - **Back.** Following a link keeps a short trail of the notes the user came from, in memory only (the last 50). Back (the arrow or Android back), **Delete note** and **Leave anyway** on the note you arrived at all return to the note you came from instead of the list, and a screen reader hears `Opened "title"`. Following a link announces `Opened "title"` or `Created "title"`. The back arrow's accessibility label reads "Back to previous note" while there is a trail. A link followed from a note that is not kept (for example a new empty note that is discarded) leaves no trail entry. A brand-new note that has not been saved yet loses a duplicate-title tie to a stored note with the same title until it is saved. The trail is forgotten when the app restarts, when the user opens a note from the list or with the "+" button, when a launch note opens, and when the user finally leaves to the list. If the note to return to has since been deleted, Back goes to the one before it, or to the list.
- **Images and privacy.** An image is written `![alt](url)` on a line of its own and is drawn in the reading view only (in the editor it is styled text). An image on a line with other text, or inside a list item, is not drawn: its alt text shows in a muted colour; tapping it starts editing the line, like any other text. Tapping an image placeholder that says "This image needs https" or "Can't show this image", or a loaded image, also starts editing (a "Tap to load" or retry placeholder loads or retries instead). A note in Recently Deleted cannot be opened (its rows offer only Restore and Delete forever), so its images are never shown there.
  - Images are not loaded unless the user allows it. Settings has a switch "Load images from the web", **off by default**. While it is off, the reading view shows a placeholder with the alt text (or "Image") and "Tap to load"; tapping loads that one image. With the switch on, images load when the note is opened in reading.
  - Loading an image is a request from the phone to the website the address points at. **The website sees the phone's IP address and device information** and learns that the image was requested. The operating system may keep the downloaded file in its own cache; Lucid keeps no copy of it and stores nothing but the text the user wrote. Lucid sends no note text and no other data of its own.
  - Only `https://` addresses are loaded. An `http://` image shows the placeholder "This image needs https" and is never requested. An address that is not a valid web address shows "Can't show this image". If a load fails (for example offline, or the address is not an image the system can show), the placeholder reads "Couldn't load this image. Tap to try again." and tapping it retries. Which image formats work is up to the system's image loader (SVG is expected to show the failure placeholder; GIF is unverified).
  - Opening a link in the browser happens only when the user taps it, and the browser then contacts that site as it normally would.
  - Voice and transcription are unchanged: transcription is on the device, and audio goes to Apple or Google only when the user turns on "Transcribe voice notes online".
- **Behaviour changes with this feature.** `#words` inside code and inside link addresses are no longer tags (so they no longer appear in the drawer or in suggestions). Todo ignores a `- [ ]` line inside a fenced code block. A first line of `### x` now gives the title "x" (it was "### x"). Lines that are rules (see above, including `- - -` and `* * *`) are rules, not bullets or text, so an existing note that used one as a divider now shows a line. A fence that is never closed runs to the end of the note.

### The editor

Status: **Built** for autosave and the first-line title. Not verified on a device.

- One page creates and edits every note. Top bar: a back arrow and, for a saved note, a "..." menu. Under it: the date, optional **voice note cards** and the **body**. At the bottom, above the keyboard when it is open, a **toolbar**, shown only while editing, with six buttons in this order: undo, redo, hide keyboard, record a voice note, "#" for tags, and a list button (see below); above it, while a tag is being typed, a row of tag suggestions.
- **List button and list controls.** The list button (label "List controls", the last of the six) replaces the keyboard with a panel of list controls the same size as the keyboard: indent, outdent, move up, move down, and the three list types (bulleted, numbered, to-do). Each button works on the line the caret is on (or every line a selection touches) and is one undo step; pressing the type the line already has removes its marker. The three type buttons (bulleted, numbered, to-do) also bring the regular keyboard back so typing can go on (only when the press changed the text; on a line where nothing applies, such as a heading, the panel stays); the four movement buttons keep the panel open. While the panel is showing the note stays in editing, the caret stays where it was, tapping the text moves the caret and leaves the panel open, and the tag and note link suggestions are not shown. The "abc" key on the panel, or the list button again, brings the keyboard back (on Android, Back does the same). Hide keyboard leaves editing and returns to reading; starting a recording or opening a voice note also leaves editing. Checking and unchecking a to-do happens by tapping its checkbox in reading. Each list level is indented four spaces (older notes with two-space levels keep working and are not rewritten).
- **Autosave.** There is no save button and no check. The editor saves on its own: a note is saved shortly after typing stops, and again when the user leaves the editor. An empty note (no text and no voice note) is never kept. Leaving the editor never asks whether to save or discard. Closing a stored voice note does not delete it at once: the recording is held, with undo, until the note is left.
- **Tag suggestions.** While a tag is being typed, a row above the toolbar suggests tags the user has used before and tags already in this note; tapping one completes the word. The "#" button types a `#` at the cursor.
- **Undo and redo** cover typing in the body (tags included, since they are body text) and closing a voice note (one history, most recent first). They are off while the recording panel is open.
- **Leaving.** The back arrow (and Android back) leaves the editor and returns to where the note was opened; what is on the note is already saved. While the recording panel is open and idle, back just closes it. While recording, back first asks "Discard this recording?" (Keep recording / Discard), and Discard deletes the unsaved recording and then carries on leaving.
- Opening a saved note does not open the keyboard by itself; it opens in the reading view (see Notes and markdown).

### Voice notes

Status: **Built** (recording, cards, the expanded view and closing with undo), and automatic transcription of new recordings on the device. Not verified on a device; whether transcription works well enough on a phone is still open.

- In editing, the toolbar's waveform button starts a voice note. In reading, where the toolbar is hidden, a round floating waveform button (label "Record voice note") sits at the bottom right, the same size and colour as the new-note button with a small shadow, and does the same. It is hidden while editing, recording or locked, and while the recording panel or voice sheet is open. Either way it opens a recording panel at the bottom of the page. It starts idle (a large timer, a flat waveform and a big red button); tapping the red button starts recording (the time and a live waveform; no pause) and tapping it again stops. Closing the idle panel (its handle, or back) needs no confirmation.
- When a recording stops, a card appears above the body: play/pause, a waveform that fills in as the voice note plays, its length, and a close button. The record buttons stay available, so a note can hold several voice notes (no limit); with several, the cards sit in a row the user swipes sideways in the order recorded (the next one peeks in, with page dots) and only one plays at a time.
- Tapping a card opens the **expanded view**: share, trash, a large waveform to scrub, the time, back and forward 15 seconds, play/pause and a playback-speed button; with several voice notes the user swipes between them. Trash is the same as the card's close.
- **Closing a voice note.** Each card has a close button that removes that voice note from the note. Closing a stored voice note moves its recording to a hold area, with undo until the note is left. Nothing stored is deleted by the close itself. When the note is left, its held recordings are permanently deleted from the phone.
- Voice notes are kept with the note when it is saved. After a recording stops, the app transcribes it on the device and adds the text to the body; there is no live text while recording. Only new recordings are transcribed, never stored ones, and nothing is sent anywhere. How well this works on a phone is not yet tested on a device (see Open decisions).

### Launch and first note of the day

Status: **Built** (the launch note since the 7a cutover; resume on a new day since chunk 7c). Not yet verified on a device.

- When the user opens the app and nothing is done yet today, it opens to a new, empty note. Once a note with content exists today, or the user backs out of the empty new note (see below), the app opens to the note list for the rest of that day. This can be turned off in Settings.
- The launch note can always be dismissed with one tap: its back arrow (and Android back) while the note is empty counts as done for the day: the day marker is written, the app lands on the note list, and the launch note does not reappear that day. There is no confirmation and no separate button. With something on the note, back just leaves; the note is already saved by autosave, which makes today done.
- The app remembers only the latest date it was counted done, in a small file on the device (the existing day marker). Nothing leaves the phone.
- Whether today is done is worked out from the saved notes and that marker. Deleting today's only note (moving it to Recently Deleted) does not reopen the launch note: once today is done it stays done for that day.
- The launch also applies when the app returns to the foreground on a different day than it left on, nothing is done today, and the setting is on. It never does this while the user is on the editor (or while a note is being saved or deleted), and never when midnight passes while the app is open. It happens at most once per new day. The new note opens over whatever screen is showing (the list, Settings, Recently Deleted) and leaving it returns to that screen.
- The app waits briefly for its stored data before deciding, with a cap of 1000 ms: if the data is not ready by then, it opens a new note so capturing is never delayed.
- Starting must be fast: the editor opens with the body focused and the voice note one tap away.
- The screen should be calm and low-glare (dark), suitable for use first thing in the morning.

### Note list and drawer

Status: **Built** for the list, the drawer views and migration lines (since the 7a cutover; the default view is Today); row swipe actions (Pin, Delete) are **Built** (7b-3). Not yet verified on a device.

- The main screen is a note list: each row shows the title, a short preview of the body and a relative time in full words ("2 seconds ago", "37 minutes ago", "3 hours ago", "2 days ago", then a short date from 7 days on; "Just now" for under a second). Newest first. A round "+" button at the bottom right starts a new note; leaving the editor returns to the list.
- A **drawer** opens from the left (a swipe from the left edge or a menu button). It holds, top to bottom: a dropdown to choose the smart view (its last row is **Recently Deleted**, with a count when there are any; it is reachable from the drawer only there), the list of tags, and a footer with a **Settings** gear at the bottom left and a **sort** button at the bottom right. The smart views, Recently Deleted and the tag rows have small icons.
- **Smart views** (chosen from the dropdown): **Today** (notes written or edited today; the default view), **Todo** (notes that contain checkboxes), **Untagged** (notes with no tag) and **Pinned**. Choosing a tag in the drawer lists the notes with that tag. The chosen view or tag is kept when the user opens a note and comes back.
- Tags in the drawer are flat, shown with how many notes use them. The sort button opens a small menu above it with **A to Z** (the default) and **Most notes** (most used first, ties A to Z); the choice applies at once and is remembered on the device. Open: whether the drawer shows every tag or only the most used.
- The **Today** view shows today's date under its title (for example "Tuesday, October 20"); it moves to the next day at midnight. Other views, and the list while searching, show no date line.
- Which day a note belongs to follows when it was first stored, in the device's local time. Today view is the one exception: it also lists a note edited today (pinning and restoring do not count as an edit), and the launch rule still counts only notes created today.
- Rows swipe left to reveal **Pin** (or **Unpin**) and, in red, **Delete** (this moves the note to Recently Deleted at once, with no confirmation and no undo; Recently Deleted is the way back). Screen readers get "Pin"/"Unpin" and "Delete" actions on every row instead of the swipe. Rows do not swipe while another trash action is running (**Built**).
- Pinning a note puts it in the Pinned view. Pin is in the note's "..." menu and by swipe on a note row. Pinning does not change a note's order in the main list, which stays by edit time (**Built**).

### Opening a saved note

Status: **Built**. Not verified on a device.

- Tapping a note in the list or in Search opens it on the editor page in the reading view (the rendered note, with its voice notes); tapping the text starts editing. It is the same page and the same route as editing, not a separate screen. Edits are saved by autosave; back (the arrow or Android back) returns to where the note was opened, or to the previous note when a link was followed (see Notes and markdown).
- A "..." (More options) menu at the top right shows for a saved note only. Its items are **Pin** (or **Unpin**) and, in red, **Delete** (see Deleting notes).

### Deleting notes

Status: **Built** (7b-3): Delete, Recently Deleted, Restore, Delete forever and Empty. Not yet verified on a device.

- **Delete** (in the "..." menu, or by swiping a row) moves the note to **Recently Deleted**. Its voice notes are kept with it. Nothing is removed from the phone at this point. When deleted from the editor, the app returns to where the note was opened, with no prompt.
- In Recently Deleted the user can **Restore** a note (it returns to the list with its voice notes, in its old position, since restoring does not change its edit time) or **Delete forever**. After a restore the user stays on Recently Deleted: the note leaves the list, a line says `Restored "title".` and screen readers hear "Restored". The note is not opened.
- **Delete forever** and **Empty Recently Deleted** are the only ways a whole note and its voice notes' audio are permanently removed, apart from one case: when the user leaves a note, voice notes they closed in it (held recordings) are permanently deleted from the phone. Both Delete forever and Empty Recently Deleted ask for confirmation first and say that they can't be undone.
- **Safety copies.** Delete forever does not remove leftover safety copies named `notes.corrupt-...` (rare; they exist only after a storage damage event). It does remove the deleted note's text from the other backup copies.
- Emptying an existing note (all text removed and no voice notes) moves it to Recently Deleted. A pinned note moved to Recently Deleted keeps its pin, so Restore brings it back pinned.
- There is no automatic purge: nothing in Recently Deleted is ever removed unless the user chooses to. (Decided 2026-10-18; a time-based purge would need a separate decision and a change to the deletion rules.)
- If a delete fails, an alert says so and the note stays.

### Search

Status: **Built** (since 7c-3; not verified on a device).

- One field for words and tags, with tag chips under it. It looks in the body (so the title and tags too) of every note, and a result must have all selected tags. Results are newest first, grouped by month. Opening a result and going back returns to the results with the query and chips kept. It is plain text matching on the device, not analysis or interpretation.
- Recently Deleted notes are not searched. Search matches the note's raw text, so it also finds words inside code and link text and addresses. Search opens from a magnifier icon at the right of the note list header (default; the drawer is the alternative). It is not a screen of its own: the header turns into the search field and the results are shown over the list, with a line "N notes found". Matches are highlighted in the title, the preview and the tag line; when a word is found only beyond the preview, the row shows an excerpt around it. "Close search" (the arrow) or Android back closes it and clears the query and chips; opening a result and coming back keeps them. The drawer cannot be opened while searching.

### Settings

Status: **Built** (since the 7a cutover, with the label "Open a new note on launch"; the images switch is new with the markdown work). Not verified on a device.

- Opened from the drawer. Switches: "Open a new note on launch", "Transcribe voice notes online" (default off) and "Load images from the web" (default off). The last has the helper line "Off: images in your notes show a placeholder you can tap to load. On: images load when you open a note. Loading an image contacts the website it comes from." It applies at once, with no confirmation, and is stored as `loadImages` in the settings file; a missing, damaged or non-boolean value means off. The launch switch controls whether the app opens a new note on the first launch each day, on by default, labelled "Open a new note on launch", with the line "When off, the app opens to the note list."
- When off, the app always opens to the note list and resume on a new day changes nothing. Backing out of an empty launch note and the "+" button are unaffected.
- The choice applies at once and is stored on the device only (a small settings file with one value per switch, plus the tag sort order). For each key a missing, damaged or wrong-typed value falls back to its default: "Open a new note on launch" on, "Transcribe voice notes online" off and "Load images from the web" off (the last two fail closed).

### Navigation

Status: **Built**. The routes are Notes (the list, root, which also hosts the drawer and inline search), Editor, Settings and Recently Deleted, on the native stack.

- Android back on the note list exits the app. Back from any other screen returns to where the user came from.
- Drawer: opens from the left and closes by tapping outside it, swiping it closed, or Android back. It also closes whenever another screen is pushed over the list. Settings and Recently Deleted open from the drawer and go back to the list.
- Bottom sheets (the recording panel, the expanded voice note view) close by dragging down, tapping the dimmed backdrop, or Android back.
- Leaving a recording asks "Discard this recording?" ("Your recording will be deleted." with "Keep recording" and "Discard"). Discard stops the recording, deletes the unsaved recording, then leaves as it would have. If the recording cannot be stopped, the "Could not finish recording" alert shows and the user stays.
- Back is ignored while a delete started from the editor is in progress, and while a `[[note]]` link is being followed (the editor is locked until the next note is open).

### Where notes are stored

Status: **Built**. Not verified on a device.

- Notes are stored on the device only, in a notes index file (`notes.json`) with voice note audio in a `notes/` folder. Each note keeps its text, created and updated times, whether it is pinned, when it was deleted (if it is in Recently Deleted) and its voice notes. The title, preview, tags and the Todo flag are worked out from the text and never stored.
- The index is written safely (a temporary file, then replaced) and an unreadable index is never overwritten blindly. Storage rules for contributors are in `CLAUDE.md`.

## Retired terms and migration

Status: **Built**. The import runs once at app start, inside the launch gate (`src/app/AppFlowProvider.tsx`), and is a one-time cutover: anything an older build writes to `dreams.json` afterwards is not imported.

These terms belong to the older concept (journals, dreams and entries, with a check button to save and "Save a draft?" or "Discard changes?" prompts when leaving) and are retired. The older screens and hooks have been removed. The terms survive only in the one-time import (`src/services/legacyImport.ts`), in migrated data, and in on-disk names kept on purpose so no stored data changes (the day marker file `no-dream.json` with its key `noDreamDate`, and the `autoOpenDreamCapture` key in the settings file). Do not use them in new copy, code or data models.

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

Existing data is brought over by a read-only import of the older data file (`dreams.json`) into notes. It runs once (a small marker file records that it ran) and never changes or removes the old files. Each old entry becomes a note laid out as: the title as the first line, then the text, then an `Emotion: sad, afraid` line when the old entry had an emotion, then one line of tags. The journal becomes the first tag (`#dreams`, `#life`, or a custom journal's name made into a tag, for example `#dream-work`), followed by the entry's own tags. Drafts become ordinary notes. The old audio stays in its old place and is played from there; it is never copied or deleted. An entry that cannot be converted (damaged id or date, or completely empty) is skipped and listed in the marker file; its data stays in `dreams.json`. If `dreams.json` cannot be read, nothing is imported and the import is tried again next time.

## Platforms

- **Mobile**: capture and daily use. This is the primary platform.
- **Desktop/tablet**: browsing, organizing and looking back over time. Later.

## Not in scope yet

Do not build these unless explicitly asked:

- Any AI features (classification, suggestions, summaries, pattern-finding)
- Tasks as a feature (due dates, reminders, completion tracking). The Todo view only lists notes that contain plain-markdown checkboxes.
- Nested tags
- Markdown beyond the scope above: tables, nested and multi-line block quotes, `~~~` fences, indented code blocks, bare-URL autolinks (a URL with no `[text](url)` around it is plain text), `[[a|b]]` aliases, reference-style links, and images inline in a line of text
- Automatic purge of Recently Deleted
- Threads or other higher-level grouping beyond tags
- Periodic roundups or summaries
- An explore/hub view
- Desktop app

## Open decisions

These are undecided. Ask before assuming an answer.

- How "on waking" is detected: for now "first open with nothing done today, or a resume on a new day" stands in for it, with the Settings toggle to turn it off. A time window is not built.
- Whether the drawer shows every tag. (Search is entered from the list header icon, by default; change it if you prefer the drawer.)
- Whether transcribing a voice note into text after recording works well enough on device (needs a device test).
