# Monkey Crossing

**Small monkey. Big commute. Traffic is bananas.**

A Frogger-style browser arcade game built with HTML, CSS, and JavaScript Canvas. Guide a monkey through traffic, ride floating logs across the river, and reach the banana grove.

## Features

- Pixel-art monkey, cars, trucks, and jungle scenery drawn directly on Canvas.
- Cartoon blood splatter on car impacts, with a toggle to turn it off.
- Keyboard controls, mobile swipe gestures, and on-screen movement buttons.
- Three lives, a 60-second timer per attempt, and progressively faster traffic.
- Collect the left, middle, and right banana spots to advance a level; each stays empty until all three are collected.
- Points for forward progress and successful crossings, plus a remaining-time bonus.
- Personal best scores and the blood-effects preference saved locally in your browser.
- Optional synthesized sound effects, pause/resume, and reduced-motion support.
- A share button that shares or copies the game URL once publicly hosted.

Blood effects are on by default; sound effects are off. Both can be changed beside the game. No account, backend, or runtime JavaScript libraries are required to play.

## How to play

Reach the banana grove at the top of the screen and move onto a banana spot to collect it. The banana disappears from that exact spot, which stays empty even if you lose a life. Empty spots and gaps do not award another banana; you can move along the grove to reach an uncollected one. Collect all three spots to advance to the next level and refill the grove.

Avoid vehicles, stay on logs in the river, and don't drift off-screen. A collision, fall into the water, or expired timer costs one life. Lose all three lives and your run ends.

| Action                | Control                                              |
| --------------------- | ---------------------------------------------------- |
| Move                  | Arrow keys or WASD                                   |
| Move on mobile        | Swipe on the game board or tap the direction buttons |
| Pause / resume        | P, Escape, or the pause button                       |
| Start / restart       | The button in the game overlay                       |
| Toggle sound or blood | Settings beside or below the game                    |

Switching tabs or moving focus to another window automatically pauses an active game.

## Run locally

The commands below assume macOS or Linux with **Node.js 22+**, **npm**, and **Python 3** available as `python3`.

```sh
git clone https://github.com/jtg-tinker/monkey-crossing.git
cd monkey-crossing
npm ci
npm start
```

Open **http://127.0.0.1:8000** in a modern browser. Stop the server with `Ctrl+C`.

For a play-only preview, Node.js and dependency installation are optional: run `python3 -m http.server 8000 --bind 127.0.0.1` from the project folder instead. Serve the files over HTTP rather than opening `index.html` directly, because the game uses JavaScript modules.

The local server is accessible only on your computer. It is not a public sharing link. Fonts are loaded from Google Fonts, with local fallback fonts if that service is unavailable.

## Test

Run the gameplay unit tests:

```sh
npm test
```

For browser tests, keep `npm start` running in one terminal and run the following in another:

```sh
npm run test:browser
```

The browser tests use installed **Google Chrome on macOS**. On Linux, install Playwright's Chromium browser first:

```sh
npx playwright install chromium
```

Browser tests cover movement, collisions, blood effects, pause/resume, game over, restart, local storage, and mobile controls/layout. Test screenshots are written to `/tmp/monkey-crossing-*.png`.

To test a different locally served copy, set `GAME_URL`:

```sh
GAME_URL=http://127.0.0.1:8000/dist/ npm run test:browser
```

## Build and share

Create a deployment folder:

```sh
npm run build
```

This copies only `index.html`, `style.css`, `game.mjs`, and `core.mjs` into `dist/`. Upload that folder to a static hosting provider. No server-side application or production dependency installation is needed.

### Netlify

Sign in at [Netlify Drop](https://app.netlify.com/drop) and drag the `dist` folder onto the page. Netlify provides a public URL that you can share with other players.

### GitHub Pages

GitHub Pages is not enabled by simply pushing the repository. To publish this project:

1. Open the repository's **Settings → Pages**.
2. Select **Deploy from a branch** as the source.
3. Select the **main** branch and **/ (root)** folder, then save.
4. Wait for deployment to finish and use the website URL shown in Pages settings.

The repository root already contains the playable static files, so branch-based GitHub Pages hosting does not need the ignored `dist/` folder. Future pushes to `main` will update the site once Pages is configured.

## Project structure

| File               | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `index.html`       | Game page, HUD, menus, and controls                                |
| `style.css`        | Responsive layout and visual styling                               |
| `game.mjs`         | Canvas rendering, input, audio, particles, and browser integration |
| `core.mjs`         | Movement, lane simulation, collisions, scoring, lives, and levels  |
| `core.test.mjs`    | Gameplay unit tests using Node's built-in test runner              |
| `browser.test.mjs` | Playwright browser integration tests                               |
| `build.mjs`        | Copies deployable files into `dist/`                               |

`node_modules/` and `dist/` are generated locally and excluded from Git.
