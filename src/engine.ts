import { IScene } from './format';

const ENGINE_SOURCE = String.raw`
import base64
import json
import math
import sys

WIDTH = 800
HEIGHT = 500
BODY_RADIUS = 14
HAZARD_RADIUS = 8
PICKUP_RADIUS = 24
STRIDE = 2.0
MAX_COMMANDS = 2000
MAX_LINES = 2000000
SOURCE = "<your code>"


class _Finished(BaseException):
    pass


class _TooLong(BaseException):
    pass


class Chip:
    def __init__(self, x, y, trapped):
        self._x = x
        self._y = y
        self._trapped = trapped
        self._collected = False

    x = property(lambda self: self._x)
    y = property(lambda self: self._y)
    trapped = property(lambda self: self._trapped)
    collected = property(lambda self: self._collected)

    def __repr__(self):
        return "Chip(x=%g, y=%g, trapped=%s, collected=%s)" % (
            self._x, self._y, self._trapped, self._collected)


def _circle_hits_rect(x, y, radius, rect):
    nearest_x = max(rect["x"], min(x, rect["x"] + rect["w"]))
    nearest_y = max(rect["y"], min(y, rect["y"] + rect["h"]))
    return math.hypot(x - nearest_x, y - nearest_y) < radius


def _number(value, command):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError("%s() needs a number, but got %r" % (command, value))
    if not math.isfinite(value):
        raise ValueError("%s() needs a finite number, but got %r" % (command, value))
    return float(value)


def _target(value, command):
    if isinstance(value, Chip):
        return value.x, value.y
    if isinstance(value, (tuple, list)) and len(value) == 2:
        return _number(value[0], command), _number(value[1], command)
    raise TypeError("%s() needs a chip or an (x, y) pair, but got %r" % (command, value))


def _run(payload):
    scene = payload["scene"]
    start = scene["start"]
    state = {"x": float(start["x"]), "y": float(start["y"]), "angle": float(start["angle"]), "commands": 0}
    chips = [Chip(c["x"], c["y"], bool(c.get("trapped"))) for c in scene["chips"]]
    events = []
    result = {"status": "incomplete", "events": events}

    def spend():
        state["commands"] += 1
        if state["commands"] > MAX_COMMANDS:
            raise _TooLong("commands")

    def finish(status, reason):
        result["status"] = status
        result["reason"] = reason
        raise _Finished()

    def blocked_at(x, y):
        if x < BODY_RADIUS or y < BODY_RADIUS or x > WIDTH - BODY_RADIUS or y > HEIGHT - BODY_RADIUS:
            return True
        return any(_circle_hits_rect(x, y, BODY_RADIUS, r) for r in scene["obstacles"])

    def hazard_at(x, y):
        for hazard in scene["hazards"]:
            if "r" in hazard:
                if math.hypot(x - hazard["x"], y - hazard["y"]) < hazard["r"] + HAZARD_RADIUS:
                    return "light"
            elif _circle_hits_rect(x, y, HAZARD_RADIUS, hazard):
                return "laser"
        return None

    def step(distance):
        distance = _number(distance, "step")
        spend()
        heading = math.radians(state["angle"])
        direction = 1.0 if distance >= 0 else -1.0
        dx, dy = math.cos(heading) * direction, math.sin(heading) * direction
        x, y = state["x"], state["y"]
        remaining = abs(distance)
        travelled = 0.0
        blocked = False
        hit = None
        picked = []
        while remaining > 0:
            stride = min(STRIDE, remaining)
            next_x, next_y = x + dx * stride, y + dy * stride
            if blocked_at(next_x, next_y):
                blocked = True
                break
            x, y = next_x, next_y
            remaining -= stride
            travelled += stride
            hit = hazard_at(x, y)
            if hit:
                break
            for index, chip in enumerate(chips):
                if not chip._collected and math.hypot(x - chip.x, y - chip.y) < PICKUP_RADIUS:
                    chip._collected = True
                    picked.append({"i": index, "at": round(travelled, 2)})
                    if chip.trapped:
                        hit = "trap"
            if hit:
                break
        state["x"], state["y"] = x, y
        event = {"t": "move", "x": round(x, 2), "y": round(y, 2), "d": round(travelled, 2), "blocked": blocked, "picked": picked}
        events.append(event)
        if hit:
            finish("failed", hit)
        if all(c._collected for c in chips if not c.trapped):
            finish("solved", "chips")

    def turn(degrees):
        degrees = _number(degrees, "turn")
        spend()
        state["angle"] += degrees
        events.append({"t": "turn", "a": round(state["angle"], 2)})

    def turn_to(target):
        x, y = _target(target, "turn_to")
        spend()
        if x == state["x"] and y == state["y"]:
            return
        wanted = math.degrees(math.atan2(y - state["y"], x - state["x"]))
        change = (wanted - state["angle"] + 180.0) % 360.0 - 180.0
        state["angle"] += change
        events.append({"t": "turn", "a": round(state["angle"], 2)})

    def distance_to(target):
        x, y = _target(target, "distance_to")
        return math.hypot(x - state["x"], y - state["y"])

    namespace = {
        "__name__": "__main__",
        "step": step,
        "turn": turn,
        "turn_to": turn_to,
        "distance_to": distance_to,
        "chips": chips,
    }
    lines = [0]

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != SOURCE:
            return None
        if event == "line":
            lines[0] += 1
            if lines[0] > MAX_LINES:
                raise _TooLong("lines")
        return tracer

    try:
        compiled = compile(payload["code"], SOURCE, "exec")
        sys.settrace(tracer)
        try:
            exec(compiled, namespace)
        finally:
            sys.settrace(None)
    except _Finished:
        pass
    except _TooLong as error:
        result["status"] = "error"
        result["error"] = {"kind": "too-long", "detail": str(error)}
    except KeyboardInterrupt:
        result["status"] = "stopped"
    except SyntaxError as error:
        result["status"] = "error"
        result["error"] = {"type": type(error).__name__, "message": error.msg, "line": error.lineno}
    except BaseException as error:
        line = None
        trace = error.__traceback__
        while trace is not None:
            if trace.tb_frame.f_code.co_filename == SOURCE:
                line = trace.tb_lineno
            trace = trace.tb_next
        result["status"] = "error"
        result["error"] = {"type": type(error).__name__, "message": str(error), "line": line}
    return result


_output = sys.stdout
_result = _run(json.loads(base64.b64decode(_CGS_PAYLOAD).decode("utf-8")))
_output.write("\n\x1eCGS" + json.dumps(_result) + "\x1e\n")
_output.flush()
`;

function toBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildRunCode(scene: IScene, code: string): string {
  const engine = toBase64(ENGINE_SOURCE);
  const payload = toBase64(JSON.stringify({ scene, code }));
  return (
    `exec(__import__("base64").b64decode("${engine}").decode("utf-8"), ` +
    `{"__name__": "__cgs__", "_CGS_PAYLOAD": "${payload}"})`
  );
}

export type GameEvent =
  | {
      t: 'move';
      x: number;
      y: number;
      d: number;
      blocked: boolean;
      picked: { i: number; at: number }[];
    }
  | { t: 'turn'; a: number };

export interface IRunResult {
  status: 'solved' | 'failed' | 'incomplete' | 'error' | 'stopped';
  reason?: string;
  events: GameEvent[];
  error?: {
    kind?: string;
    detail?: string;
    type?: string;
    message?: string;
    line?: number | null;
  };
  output?: string;
}

const RESULT_PATTERN = /\n?\x1eCGS([\s\S]*?)\x1e\n?/;

export function readRunOutput(stdout: string): IRunResult | null {
  const match = RESULT_PATTERN.exec(stdout);
  if (!match) {
    return null;
  }
  const result = JSON.parse(match[1]) as IRunResult;
  result.output = stdout.replace(RESULT_PATTERN, '');
  return result;
}
