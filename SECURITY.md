# Security

## Reporting

Report anything you believe is a vulnerability privately, through GitHub's
[private advisory form](https://github.com/hub-ki/video-generation/security/advisories/new),
rather than in a public issue. Please include what you did, what happened, and what you expected.

Issues and pull requests are closed to the public on this repository, so the advisory form is the
way in.

This is a small project maintained alongside other work. There is no bounty, and no promised fix
window.

## What this software is

Two agent skills that drive a real browser at a URL and render the result. That is the whole
threat model, and it has three sharp edges worth naming.

**It runs a browser at a URL you supply.** For a page you do not control, Chromium's own sandbox
is switched on, and the profile is thrown away after the run. Nothing validates the URL, its
redirects, or the subresources the page loads. On your own machine, under your own supervision,
that is a browser doing what a browser does. Exposed as a service that takes URLs from strangers,
it is a server-side request forgery primitive: the fix is network isolation around it, not a
deny-list inside it.

**It executes a capture script you edit by hand.** `capture-template.js` is a starting point you
copy into a project and change. It is code, with your privileges, and it deletes its own output
directory before every run. Treat a capture script from someone else the way you would treat any
other script from someone else.

**It handles a login when you ask it to.** `capture-auth.js` opens a browser for a human to sign
in, and writes the session to `storageState.json` in the project directory. That file is a live
credential. It is gitignored here; it is your job not to commit it, ship it, or leave a third
party's session lying next to the footage.

## What is out of scope

Bugs in HyperFrames, Playwright, Chromium or ffmpeg belong upstream. Report them there; tell us
too if this project's pinned version makes them worse.

A capture that misses a consent wall is a bug we want to hear about, but it is not a
vulnerability: the rig reports what it found, never that a page is clean. That distinction is
documented in [`references/foreign-sites.md`](skills/demo-video/references/foreign-sites.md).
