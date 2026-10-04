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
- **Low friction.** Capturing should never feel like data entry. No required fields, no streaks, no scores, no gamification.
- **Plain language.** The design is inspired by Jungian ideas (conscious and unconscious, recurring symbols, noticing strong reactions), but the app never uses psychological or Jungian terms. No "shadow," "archetype," "individuation," etc. in UI copy, and don't present anything as psychological interpretation.

## Vocabulary

Use these terms consistently in UI copy, code and data models.

| Term          | Meaning                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Journal entry | A free-form daily writing entry.                                                                      |
| Dream         | A dream capture, usually made right after waking.                                                     |
| Tag           | A label the user applies to journal entries and dreams.                                               |
| No dream      | The one-tap option on dream capture for a morning with nothing to record. Counts as done for the day. |

Tags cover anything the user wants to track over time, such as a recurring dream image ("water"), strong emotional reactions, or something practical like "agent mistake." Seeing everything under one tag over time is the main way patterns show up. There is no separate "tracker" concept; tags fill that role.

## Core behavior (v1)

### Morning dream capture

- When the user opens the app on waking, it opens to the dream capture screen.
- Dream capture can always be dismissed with one tap via "No dream".
- Once a dream is saved or "No dream" is chosen for the day, the app opens to the journal instead.
- Audio recordings are kept alongside transcripts.
- Dream capture must be fast: the user should be able to start capturing immediately, since dreams fade within minutes.
- The screen should be calm and low-glare (dark), suitable for use right after waking.

### Journal

- Entries are written chronologically.
- The structure of the journal (home screen layout, browsing, timeline) has not been decided yet. Don't design it without checking first.

### Tags

- Tags apply to both journal entries and dreams.
- Tagging is optional and lightweight.

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

These are undecided. Ask before assuming an answer.

- Whether dream capture leads with voice or writing (both directions have been mocked up)
- How "on waking" is detected (time window, first open of the day, user setting)
- Journal structure and navigation
