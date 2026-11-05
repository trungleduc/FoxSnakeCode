# FoxSnakeCode

A coding puzzle game for JupyterLab and JupyterLite. Double-click a `.fsc` file to open a split panel: write Python on the left, then press Run to watch Grep Fox or Sudo Snake steal data chips from a night-time facility on the right.

FoxSnakeCode runs your code on a Python kernel and prefers xeus-python.

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

## JupyterLite demo site

The `demo` folder holds a JupyterLite site with xeus-python running in the browser. Put missions in `demo/files`, then build the site with the extension installed:

```bash
jlpm build:demo
```

The site is written to `demo/_output`, which you can host on any static web server.

In JupyterLite, saved progress stays in that browser's storage.

Stop restarts the kernel, so the next Run can take a few seconds in JupyterLite.

## Commands players can use

| Command | What it does |
| --- | --- |
| `step(distance)` | Walk forward. A negative number walks backward. |
| `turn(degrees)` | Turn right. A negative number turns left. |
| `turn_to(target)` | Face a chip or an `(x, y)` position. |
| `distance_to(target)` | Get the distance to a chip or an `(x, y)` position. |
| `chips` | The list of chips. Each has `x`, `y`, `trapped` and `collected`. |

A level is solved when every chip that isn't trapped has been collected. Searchlights, lasers and trapped chips end the attempt, while crates and walls just block the way.

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
        ]
      }
    }
  ]
}
```

For a single level, put `instructions`, `starterCode` and `scene` at the top level instead of using `levels`. The level picker is then hidden.

In `hazards`, an item with `r` is a searchlight and an item with `w` and `h` is a laser. Text between backticks in `instructions` is shown as code.

### Saved progress

Players' work is saved automatically to a `progress` section in the same file, so they can close it and continue later:

```json
"progress": {
  "mascot": "fox",
  "currentLevel": 2,
  "solved": [0, 1],
  "code": { "0": "step(300)\n" }
}
```

Levels in `solved` and `code` are identified by their position in the list, starting at 0. Sharing a file also shares this section, including the player's answers.
