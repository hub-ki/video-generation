# Multiple takes — turning a one-take session into a clean demo

*(A **Phase 1B problem only**. Capture the app yourself and it cannot occur — the script
performs each action exactly once. If you are reading this while holding a `.mov`, it is the
core of the job, not an edge case.)*

The user records themselves *doing* the thing, live, often redoing steps until they get a
clean run. The raw file therefore contains several takes of the same moments plus mistakes.
The finished demo must read as one flawless run — so you **select the best take of every
moment and cut the rest out completely** (not even a frame of a bad take in a montage).

**How to spot a retry / bad take** (while reading the content map):

- The **same action appears twice** — the same prompt, screen, or click recurs after a gap.
- An **error or confused state** followed by a redo — an app error, an "undo", the
  assistant misunderstanding, a dead-end, then the user trying again.
- **Corrections in progress** — backspacing, re-typing, fixing a typo, closing a wrong dialog.
- A **fresh start** — a new chat / reload / navigating away and coming back to redo it.
- The **content differs across attempts** — e.g. a token or option present on the second
  attempt but not the first (our `/outlook` case: same sentence, but only the retake had
  the skill attached, and only that one produced a correct result).

**Choosing:** the keeper is the take whose **result actually succeeds** — usually the
*last* attempt of a given action. Pin down its exact source range, then cut that beat's
clip from it and **discard the failed range entirely**. Watch the boundaries: when a
beat is sped up, make sure the montage starts *after* the last retry so no glimpse of a
bad take leaks in, and ends before the next mistake.

**Verify:** after cutting, snapshot the beat and confirm it's the clean take (the right
UI state, the success, no error banner). If which take to show is genuinely ambiguous
(both look fine, or the user might want the "before"), ask — one line, cheaper than a re-render.
