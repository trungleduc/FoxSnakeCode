<div align="center">
  <img src="docs/grep-fox.png" width="140" alt="Grep Fox">
  <img src="docs/sudo-snake.svg" width="140" alt="Sudo Snake">

  <h1>FoxSnakeCode</h1>
  <p><strong>Tactical Coding Action</strong></p>
  <p>Coding missions, challenges, stealth debugging, boss levels...</p>
  <p><em>Write Python. Slip past the searchlights. Steal the data.</em></p>
  <p><a href="https://trungleduc.github.io/FoxSnakeCode/lab/"><strong>Try it in your browser</strong></a></p>
</div>

## Meet the team

| | Codename | Role | |
| --- | --- | --- | --- |
| 🦊 | **Grep Fox** | Field agent | Sniffs out any word, in any file, in a flash. Your code tells Grep Fox where to go. |
| 🐍 | **Sudo Snake** | HQ | Sneaks past bugs and runs every command with superpowers. Briefs you on every mission. |

## How it plays

1. Click FoxSnakeCode in the launcher to start a new game, or double-click a saved `.fsc` file.
2. Pick the next open level on the map. Solving a level unlocks the one after it, and every 10th level is a boss.
3. Read your briefing from Sudo Snake.
4. Write Python, then press Run.
5. Watch Grep Fox dodge searchlights, lasers and decoys to grab every data chip.

FoxSnakeCode runs in JupyterLab and JupyterLite. Your code runs on a Python kernel, and xeus-python is preferred. The `foxsnakecode` package must be installed in the same environment as the kernel.

## Hints from Sudo Snake

Press **Ask for a hint** during a mission to chat with Sudo Snake. Hints use [jupyter-ai-lite](https://github.com/jupyterlite/ai), so players connect their own AI provider or sign in with OpenRouter from **Set up AI**. By default the key is kept in memory and cleared when the page reloads. Never put your own API key in a deployed site, because anyone can read it.

Sudo Snake only sees the current level, the player's code and their last result, and has no tools. Its instructions keep it on the game and away from full solutions, but they run in the player's browser and are not a guarantee. The demo site turns off the general AI chat and code completion.

## Install for development

```bash
micromamba create -n cgs -c conda-forge python=3.12 'jupyterlab=4.*' 'nodejs=22' xeus-python jupyterlite-core jupyterlite-xeus pip
micromamba activate cgs
pip install -e .
jupyter labextension develop . --overwrite
jlpm install
jlpm build
jupyter lab
```

Then click FoxSnakeCode in the launcher.

The game logic is in `foxsnakecode/engine.py` and the levels are in `foxsnakecode/missions.json`. After editing the engine, press Stop or restart the kernel to load the new code. After editing the levels, close and reopen the game.

## JupyterLite demo site

The `demo` folder holds a JupyterLite site with xeus-python running in the browser. Build the site with the extension installed:

```bash
pip install build hatchling hatch-nodejs-version hatch-jupyter-builder
jlpm build:demo
```

This builds the `foxsnakecode` wheel and installs it into the site's kernel. The site is written to `demo/_output`, which you can host on any static web server.

After changing the extension, the Python package or the missions, `jlpm update:demo` copies them into an existing `demo/_output` without a full rebuild.

A local demo build keeps files in memory only, so nothing is saved in the browser and reloading the page loses any game you started.

The site deployed to GitHub Pages saves games in the player's browser instead.

Stop restarts the kernel, so the next Run can take a few seconds in JupyterLite.

## Commands players can use

| Command | What it does |
| --- | --- |
| `step(distance)` | Walk forward. A negative number walks backward. |
| `turn(degrees)` | Turn right. A negative number turns left. |
| `turn_to(target)` | Face a chip, a guard or an `(x, y)` position. |
| `distance_to(target)` | Get the distance to a chip, a guard or an `(x, y)` position. |
| `wait(seconds)` | Stay still for a number of seconds. |
| `chips` | The list of chips. Each has `x`, `y`, `trapped` and `collected`. |
| `guards` | The list of guards. Each has `x`, `y` and `angle`, and they update as time passes. |

A level is solved when every chip that isn't trapped has been collected. Searchlights, lasers, trapped chips and being spotted by a guard end the attempt, while crates and walls just block the way.

## Adding levels

Levels are in `foxsnakecode/missions.json`, and their order in the list is their order on the map. The world is 800 by 500 steps, with `x` increasing to the right and `y` increasing downward. An `angle` of 0 faces right.

```json
{
  "title": "FoxSnakeCode",
  "levels": [
    {
      "id": "first-steps",
      "title": "First Steps",
      "instructions": "Reach the chip with `step`.",
      "starterCode": "step(100)\n",
      "scene": {
        "start": { "x": 100, "y": 250, "angle": 0 },
        "chips": [{ "x": 400, "y": 250 }, { "x": 600, "y": 250, "trapped": true }],
        "obstacles": [{ "x": 300, "y": 50, "w": 100, "h": 100 }],
        "hazards": [
          { "x": 600, "y": 100, "r": 50 },
          { "x": 200, "y": 400, "w": 300, "h": 6 }
        ],
        "guards": [
          { "route": [{ "x": 200, "y": 300 }, { "x": 600, "y": 300 }], "speed": 80 }
        ]
      }
    }
  ]
}
```

Each level needs a unique `id`. Saved games refer to levels by `id`, so never change one after release; new levels can go anywhere in the list without breaking saves. Add `"boss": true` to mark a boss level.

In `hazards`, an item with `r` is a searchlight and an item with `w` and `h` is a laser. Text between backticks in `instructions` is shown as code.

In `guards`, each guard walks its `route` at `speed` steps per second, then returns to the first point and starts again. Grep Fox is spotted inside a guard's vision cone or by touching the guard, and crates block the cone. Put guard routes where they don't pass through crates.

## The `.fsc` file

A `.fsc` file holds only the player's save and starts empty, so each file is a separate playthrough. Work is saved automatically so players can close it and continue later:

```json
{
  "progress": {
    "currentLevel": "first-steps",
    "solved": ["first-steps"],
    "code": { "first-steps": "step(300)\n" }
  }
}
```

Sharing a file also shares the player's answers.
