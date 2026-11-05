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

1. Double-click a `.fsc` mission file.
2. Read your briefing from Sudo Snake.
3. Write Python, then press Run.
4. Watch Grep Fox dodge searchlights, lasers and decoys to grab every data chip.

FoxSnakeCode runs in JupyterLab and JupyterLite. Your code runs on a Python kernel, and xeus-python is preferred. The `foxsnakecode` package must be installed in the same environment as the kernel.

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

Then open `demo/files/first-mission.fsc`.

The game logic is in `foxsnakecode/engine.py`. After editing it, press Stop or restart the kernel to load the new code.

## JupyterLite demo site

The `demo` folder holds a JupyterLite site with xeus-python running in the browser. Put missions in `demo/files`, then build the site with the extension installed:

```bash
pip install build hatchling hatch-nodejs-version hatch-jupyter-builder
jlpm build:demo
```

This builds the `foxsnakecode` wheel and installs it into the site's kernel. The site is written to `demo/_output`, which you can host on any static web server.

After changing the extension, the Python package or the missions, `jlpm update:demo` copies them into an existing `demo/_output` without a full rebuild.

A local demo build keeps files in memory only, so nothing is saved in the browser and reloading the page starts the mission fresh.

The site deployed to GitHub Pages saves progress in the player's browser instead. Returning players keep their saved copy of a mission, so they won't see later edits to that file unless they clear their browser data or the update ships under a new file name.

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

## The `.fsc` file format

A `.fsc` file is JSON. The world is 800 by 500 steps, with `x` increasing to the right and `y` increasing downward. An `angle` of 0 faces right.

A file can hold a list of levels:

```json
{
  "title": "My Mission",
  "levels": [
    {
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

For a single level, put `instructions`, `starterCode` and `scene` at the top level instead of using `levels`. The level picker is then hidden.

In `hazards`, an item with `r` is a searchlight and an item with `w` and `h` is a laser. Text between backticks in `instructions` is shown as code.

In `guards`, each guard walks its `route` at `speed` steps per second, then returns to the first point and starts again. Grep Fox is spotted inside a guard's vision cone or by touching the guard, and crates block the cone. Put guard routes where they don't pass through crates.

### Saved progress

Players' work is saved automatically to a `progress` section in the same file, so they can close it and continue later:

```json
"progress": {
  "currentLevel": 2,
  "solved": [0, 1],
  "code": { "0": "step(300)\n" }
}
```

Levels in `solved` and `code` are identified by their position in the list, starting at 0. Sharing a file also shares this section, including the player's answers.
