# Monkey Crossing

**Small monkey. Wild world. The jungle is bananas.**

A Frogger-style jungle survival arcade game built with HTML, CSS, and JavaScript Canvas. Guide a monkey through rotating biomes, dodge predators and ambush snakes, ride floating logs across the river, and reach the banana grove.

## Features

- Pixel-art monkey, predators, snakes, and jungle scenery drawn directly on Canvas.
- Five rotating biomes: **Jungle**, **Savanna**, **Arctic**, **Volcano**, and **Zoo Escape**.
- Lions, tigers, bears, hyenas, wolves, polar bears, dinosaurs, lava hazards, gorillas, and zoo security vehicles.
- Stationary ambush snakes appear on safe jungle paths; grenades can clear them for bonus points.
- Cartoon blood splatter on animal attacks, with a toggle to turn it off.
- Keyboard controls, mobile swipe gestures, on-screen movement buttons, and iOS/Android selection, long-press, and page-scroll suppression while a run is active.
- Three lives, a 60-second timer per attempt, and progressively faster hazards.
- Collect the left, middle, and right banana spots to advance a level; each stays empty until all three are collected.
- Pairs of gold coins appear on different hazard lanes and load up to three grenade shots. B/Space, double-tap, or FIRE disables a hazard for +25 points; wrecked hazards stop being deadly until they leave or recover.
- Points for forward progress, successful crossings, and hazard blasts, plus a remaining-time bonus.
- Personal best scores and the blood-effects, dark mode, and black & white preferences saved locally in your browser.
- A public **Top Monkey Crossers** leaderboard with three-letter arcade initials, player platform, and 1st–10th records.
- Optional black & white display mode, synthesized sound effects, pause/resume, and reduced-motion support.

Blood effects are on by default; sound effects are off. Both can be changed beside the game. No account is required to play. The public leaderboard uses Netlify Functions and Netlify Blobs when the site is deployed through Netlify; local previews use a browser-only board.

## How to play

Reach the banana grove at the top of the screen and move onto a banana spot to collect it. The banana disappears from that exact spot, which stays empty even if you lose a life. Empty spots and gaps do not award another banana; you can move along the grove to reach an uncollected one. Collect all three spots to advance to the next level and refill the grove.

Two gold coins appear briefly on different hazard lanes. Collect one to load a shot, then press **B** or **Space** on desktop, or double-tap/tap **FIRE** on mobile, to launch a grenade. A hit disables that hazard or clears a snake and awards 25 points.

Each level changes the survival zone: jungle predators and snakes, savanna lions and hyenas, arctic wolves and polar bears, volcano dinosaurs and lava, then zoo tigers, gorillas, and security vehicles. The cycle repeats with faster hazards.

Avoid animals and snakes, stay on logs in the river, and don't drift off-screen. An attack, fall into the water, or expired timer costs one life. Lose all three lives and your run ends. If the score qualifies for the public top ten, enter three letters on **Top Monkey Crossers** to save your User, Score, Platform, and Record rank.

| Action                | Control                                              |
| --------------------- | ---------------------------------------------------- |
| Move                  | Arrow keys or WASD                                   |
| Move on mobile        | Swipe on the game board or tap the direction buttons |
| Fire grenade          | B or Space after collecting a coin                   |
| Fire on mobile        | Double-tap the game board or the FIRE button         |
| Pause / resume        | P, Escape, or the pause button                       |
| Start / restart       | The button in the game overlay                       |
| Toggle sound, blood, dark, or black & white | Settings beside or below the game      |

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

Browser tests cover movement, biome visuals, animal and snake hazards, blood effects, coin-powered shooting, pause/resume, game over, restart, leaderboard submission, local storage, and mobile controls/layout. Test screenshots are written to `/tmp/monkey-crossing-*.png`.

To test a different locally served copy, set `GAME_URL`:

```sh
GAME_URL=http://127.0.0.1:8000/dist/ npm run test:browser
```

## Build and share

Create a deployment folder:

```sh
npm run build
```

This copies the static browser files into `dist/`. The shared leaderboard also requires the Netlify function in `netlify/functions/`; deploy it by connecting the Git repository to Netlify rather than using a manual `dist` upload.

### Netlify

The included `netlify.toml` sets the build command to `npm run build`, publishes `dist/`, and deploys `netlify/functions/`. Netlify Blobs is provisioned automatically for the site; no database credentials are required.

For a new Netlify site, import `jtg-tinker/monkey-crossing`, keep the `main` production branch, and deploy. For an existing site, connect the repository under the project's build settings and trigger a deploy. Pushes to `main` update both the game and `/api/leaderboard`.

### GitHub Pages

GitHub Pages is not enabled by simply pushing the repository. To publish this project:

1. Open the repository's **Settings → Pages**.
2. Select **Deploy from a branch** as the source.
3. Select the **main** branch and **/ (root)** folder, then save.
4. Wait for deployment to finish and use the website URL shown in Pages settings.

The repository root already contains the playable static files, so branch-based GitHub Pages hosting does not need the ignored `dist/` folder. Future pushes to `main` will update the site once Pages is configured. GitHub Pages cannot run the Netlify function, so its leaderboard falls back to a browser-only board; use Netlify for the public board.

## Project structure

| File                                | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `index.html`                        | Game page, HUD, menus, and controls                                |
| `style.css`                         | Responsive layout and visual styling                               |
| `game.mjs`                          | Canvas rendering, input, audio, particles, and browser integration |
| `core.mjs`                          | Movement, lane simulation, collisions, scoring, lives, and levels  |
| `leaderboard-core.mjs`              | Shared leaderboard validation, sorting, and ranking logic          |
| `netlify/functions/leaderboard.mjs` | Public leaderboard API backed by Netlify Blobs                     |
| `netlify.toml`                      | Netlify build, publish, and functions configuration                |
| `core.test.mjs`                     | Gameplay unit tests using Node's built-in test runner              |
| `leaderboard.test.mjs`              | Leaderboard and API unit tests                                     |
| `browser.test.mjs`                  | Playwright browser integration tests                               |
| `build.mjs`                         | Copies deployable files into `dist/`                               |

`node_modules/` and `dist/` are generated locally and excluded from Git.
