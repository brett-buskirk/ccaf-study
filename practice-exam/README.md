# Practice exam

[Back to the study guide](../README.md)

`ccaf-practice.html` is a self-contained practice quiz for the **Claude Certified Architect – Foundations** exam. It's one HTML file with no dependencies, no install, no account, and no network access. Download it, open it in a browser, and start answering. It works the same on a laptop, a Chromebook, or a phone.

The quiz keeps track of what you get right and wrong. It shows which parts of the exam you're strong and weak in, and it steers new questions toward your weak spots.

**Try it now:** <https://brett-buskirk.github.io/ccaf-study/practice-exam/ccaf-practice.html>

This is an unofficial study aid. It isn't affiliated with or endorsed by Anthropic. The questions were written with Claude, based on the task statements in the official exam guide. They are not real exam questions.

## What's in it

- **150 multiple-choice questions** covering all **30 task statements** in the exam's **five domains**, with 3 to 6 questions per task statement.
- **An explanation for every question.** It appears after you answer, whether you got it right or wrong.
- **Domain weights that match the exam**, so your overall score reflects how the exam is scored:

| Domain | Weight | Questions |
| --- | --- | --- |
| 1. Agentic architecture and orchestration | 27% | 40 |
| 2. Tool design and MCP integration | 18% | 27 |
| 3. Claude Code configuration and workflows | 20% | 30 |
| 4. Prompt engineering and structured output | 20% | 30 |
| 5. Context management and reliability | 15% | 23 |

Task-statement numbers such as 2.3 or 5.4 refer to the official exam guide. They also appear in the [hands-on builds](../README.md#the-builds), so you can go from a weak area on the quiz to the build that covers it.

## Getting started

There are two ways to run it. They work the same.

**Online, the easiest way.** Open the [hosted copy](https://brett-buskirk.github.io/ccaf-study/practice-exam/ccaf-practice.html) in any browser and bookmark it. On a phone, use your browser's "Add to Home Screen" so it opens like an app. You always get the latest version of the questions. The page still runs entirely in your browser, and your answers aren't sent anywhere.

**Offline, as a file.**

1. Download `ccaf-practice.html`. On GitHub, open the file and use the download button, or clone the repo.
2. Save it somewhere you'll find again, such as Documents or Downloads.
3. Open it in any current browser: Chrome, Edge, Firefox, or Safari. On a computer, double-click it. On a phone, open it from your Files or Downloads app.

The downloaded file keeps working with no internet connection. It won't pick up question fixes, though, so download it again now and then.

Progress doesn't sync between devices, between browsers, or between the online and offline copies. Each one keeps its own. You can move progress between them yourself (see [Your data](#your-data)).

## How it works

### Practice

Each question names its domain and task statement, then lists four answers in random order. Click an answer, or press `1`–`4` or `A`–`D` on a keyboard. The quiz marks the correct answer and shows the explanation.

**"That was a guess."** After a correct answer, you can tick this box. The question then counts as *not yet known*, and it comes back like a miss would. Use it honestly. Lucky guesses are the main thing that makes a practice score look better than it should.

**"Favor my weak and unseen areas"** is on by default. With it on, the quiz picks a task statement first, giving more weight to the ones you miss most and the ones you haven't covered yet. Then it picks a question from that task statement. Turn it off for an even spread across the whole bank.

Either way, the quiz:

- shows questions you haven't seen before ones you have;
- among questions you've seen, shows the ones you missed or guessed before the ones you got right, oldest first;
- won't repeat any of your last 12 questions.

### The coverage map

The row of squares across the top has one square per task statement, grouped by domain.

- **Green:** 80% or more
- **Amber:** 60–79%
- **Red, hatched:** under 60%
- **Empty:** not started

The square for the current question is outlined. Click the map to open Progress. The line under the map shows how many questions you've seen, your exam-weighted score, your weakest and strongest domains, and how many you've answered correctly today.

### Progress

The Progress tab shows a bar for each domain and each task statement, plus a **Work on these first** list of your three weakest task statements once you have enough answers. Select any bar to practice only that area. Select **Show all** on the Practice tab to go back to the full bank.

### About

The **About** tab is a short version of this README inside the page itself, for anyone who got the file without the repo. On your first visit, a "See how this works" link under the map takes you there.

### Light and dark themes

The **Theme** button at the top right switches between **Auto**, **Dark**, and **Light**. Auto follows your device's setting. Dark is easier on the eyes at night or in low light. Your choice is remembered in each browser. It's stored separately from your progress, so exporting, importing, or erasing progress doesn't change it.

### How scores are calculated

- **Only your latest answer to each question counts.** If you miss a question and get it right later, your score goes up. Old misses don't drag it down forever.
- **A guess counts as not known**, even when it was correct.
- **Scores are out of the questions you've seen, not the whole bank.** 90% after 20 questions means you knew 18 of those 20. It doesn't predict an exam score until you've covered most of the bank.
- **The overall score is weighted by domain** using the exam's weights, so a weak score in Domain 1 (27%) costs more than one in Domain 5 (15%).

## Your data

Everything stays in the browser on the device you're using. The file never sends anything anywhere. Progress is saved automatically, and the **Your data** tab has three controls:

- **Export progress** downloads your answer history as a file named `ccaf-progress-YYYY-MM-DD.json`.
- **Import progress** reads an exported file and **merges** it with what's already in the browser. It never overwrites. Answers already present are skipped, so importing the same file twice is harmless.
- **Erase progress** deletes all saved answers. You have to click it twice.

**Moving progress between devices.** Export on one device, send yourself the file (email, cloud drive, USB stick), and import it on the other. The merge works in both directions, so to bring two devices fully in line, export from each and import into the other. Only answers move between devices. Settings such as the weak-areas toggle stay with each browser.

**When progress can disappear.** Progress is tied to one browser on one device. You can lose it if you:

- clear the browser's history or site data;
- use a private or incognito window, which forgets everything when closed;
- open the file in a different browser, or move or rename it (some browsers treat a moved file as a different page).

If the browser blocks saving entirely, the quiz says so on the Practice tab, and your progress lasts only until you close the page. Export often, especially on a phone, and keep the latest export somewhere safe.

## Getting the most out of it

- **Commit to an answer before you look at the choices.** Read the scenario, decide what you'd do, then find the match. The exam is scenario-based, and this habit is the one it rewards.
- **Read the explanation even when you're right.** Sometimes you'll be right for the wrong reason, and the explanation is where you find out.
- **Cover the whole bank before you trust your score.** Early on the score swings a lot. Once the map has no empty squares, it starts to mean something.
- **Then work your weak spots.** Leave the weak-areas toggle on, or open Progress and practice a red task statement directly. When a whole area keeps coming up red, the matching hands-on build will teach it better than more questions will.
- **Practice little and often.** Ten questions while the kettle boils works better than an hour once a week. That's why the file runs fine on a phone.
- **Don't confuse recognition with understanding.** The bank has 150 fixed questions, and after a few passes you'll remember the answers. Once you're scoring green everywhere, try explaining *why* each wrong answer is wrong. If you can, you know the material and not just these questions.

## If something looks wrong

The questions were written with Claude from the official exam guide and checked against current Anthropic documentation. Some mistakes may still be in there. Where the exam guide and current Claude tooling disagree, the quiz goes with the exam guide, because that's what the exam grades. The [root README](../README.md#where-the-exam-guide-and-current-tooling-disagree) lists the known differences. If you think an answer or explanation is wrong, please open an issue with the question text.

## For maintainers

The whole quiz lives in `ccaf-practice.html`. The question bank is the `BANK` array in the `<script>` block. Each entry looks like this:

```js
{ "id": "1.1-01",   // task statement plus a sequence number; must be unique and must not change
  "d": 1,           // domain, 1–5
  "t": "1.1",       // task statement; must be a key in TASKS
  "q": "…",         // question text
  "o": ["…", "…", "…", "…"],  // exactly four answers; the FIRST one is correct (the quiz shuffles them)
  "e": "…" }        // explanation shown after answering
```

Saved progress refers to questions by `id`. When the page loads, it quietly drops saved answers whose `id` is no longer in the bank. So don't rename existing IDs. To retire a question, remove it. To replace one, give the new question a new ID.

To check the page after a change, run `npm install && npm test` in `practice-exam/`. The test loads the page in a simulated browser (jsdom) and drives answering, every tab, the About links, theme switching, and erasing progress. It checks behavior, not appearance, so look at the page yourself too. The quiz itself never needs npm.

The About tab's text lives in `renderAbout()` and is adapted from this README. If you change how the quiz behaves, update both. Its question and task counts are computed from the bank, so they never need editing.

Progress is saved under the browser storage key `ccaf-practice-v1`, and the theme choice under `ccaf-practice-theme`. If you change the format of saved data, change the key too, so old saves aren't misread.

The hosted copy is served by GitHub Pages straight from the `main` branch, so a merged change goes live within a few minutes. The empty `.nojekyll` file at the repo root tells Pages to serve files as they are instead of running them through Jekyll. Without it, Jekyll would treat the `${{ … }}` expressions in the Build 2 guide as its own template tags and blank them out. Because Jekyll is off, nothing renders the root README as the site's home page. Instead, the root `index.html` redirects the site's root URL to the quiz.
