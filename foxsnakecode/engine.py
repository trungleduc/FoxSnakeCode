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
WALK_SPEED = 240.0
MIN_COMMAND_TIME = 0.07
BUMP_TIME = 0.26
TURN_TIME = 0.35
GUARD_TOUCH = 32
GUARD_TICK = 1.0 / 60.0
MAX_GUARD_TIME = 600.0
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


def _guard_pose(guard, time):
    moment = time % guard["period"]
    for leg in guard["legs"]:
        if moment < leg["t1"]:
            break
    progress = (moment - leg["t0"]) / (leg["t1"] - leg["t0"])
    return (
        leg["x0"] + (leg["x1"] - leg["x0"]) * progress,
        leg["y0"] + (leg["y1"] - leg["y0"]) * progress,
        leg["a0"] + (leg["a1"] - leg["a0"]) * progress,
    )


class Guard:
    def __init__(self, guard, clock):
        self._guard = guard
        self._clock = clock

    x = property(lambda self: round(_guard_pose(self._guard, self._clock())[0], 2))
    y = property(lambda self: round(_guard_pose(self._guard, self._clock())[1], 2))
    angle = property(lambda self: round(_guard_pose(self._guard, self._clock())[2] % 360.0, 2))

    def __repr__(self):
        return "Guard(x=%g, y=%g, angle=%g)" % (self.x, self.y, self.angle)


def _circle_hits_rect(x, y, radius, rect):
    nearest_x = max(rect["x"], min(x, rect["x"] + rect["w"]))
    nearest_y = max(rect["y"], min(y, rect["y"] + rect["h"]))
    return math.hypot(x - nearest_x, y - nearest_y) < radius


def _line_hits_rect(x0, y0, x1, y1, rect):
    near, far = 0.0, 1.0
    for origin, change, low, high in (
        (x0, x1 - x0, rect["x"], rect["x"] + rect["w"]),
        (y0, y1 - y0, rect["y"], rect["y"] + rect["h"]),
    ):
        if change == 0:
            if origin < low or origin > high:
                return False
            continue
        first, second = (low - origin) / change, (high - origin) / change
        near = max(near, min(first, second))
        far = min(far, max(first, second))
    return near <= far


def _guard_spots(guard, time, x, y, obstacles):
    guard_x, guard_y, angle = _guard_pose(guard, time)
    distance = math.hypot(x - guard_x, y - guard_y)
    if distance < GUARD_TOUCH:
        return True
    if distance > guard["sight"]:
        return False
    bearing = math.degrees(math.atan2(y - guard_y, x - guard_x))
    if abs((bearing - angle + 180.0) % 360.0 - 180.0) > guard["fov"] / 2.0:
        return False
    return not any(_line_hits_rect(guard_x, guard_y, x, y, r) for r in obstacles)


def _number(value, command):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError("%s() needs a number, but got %r" % (command, value))
    if not math.isfinite(value):
        raise ValueError("%s() needs a finite number, but got %r" % (command, value))
    return float(value)


def _target(value, command):
    if isinstance(value, (Chip, Guard)):
        return value.x, value.y
    if isinstance(value, (tuple, list)) and len(value) == 2:
        return _number(value[0], command), _number(value[1], command)
    raise TypeError("%s() needs a chip, a guard or an (x, y) pair, but got %r" % (command, value))


def _run(payload):
    scene = payload["scene"]
    start = scene["start"]
    state = {"x": float(start["x"]), "y": float(start["y"]), "angle": float(start["angle"]), "commands": 0, "time": 0.0}
    chips = [Chip(c["x"], c["y"], bool(c.get("trapped"))) for c in scene["chips"]]
    guards = [Guard(g, lambda: state["time"]) for g in scene["guards"]]
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

    def spotted():
        if not scene["guards"]:
            return False
        if state["time"] > MAX_GUARD_TIME:
            raise _TooLong("time")
        return any(_guard_spots(g, state["time"], state["x"], state["y"], scene["obstacles"]) for g in scene["guards"])

    def pass_time(seconds):
        if not scene["guards"]:
            state["time"] += seconds
            return seconds, False
        elapsed = 0.0
        while elapsed < seconds:
            tick = min(GUARD_TICK, seconds - elapsed)
            elapsed += tick
            state["time"] += tick
            if spotted():
                return elapsed, True
        return elapsed, False

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
            state["x"], state["y"] = x, y
            state["time"] += stride / WALK_SPEED
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
            if not hit and spotted():
                hit = "guard"
            if hit:
                break
        walk_time = travelled / WALK_SPEED
        extra_time = 0.0
        if not hit:
            rest = max(MIN_COMMAND_TIME - walk_time, 0.0) + (BUMP_TIME if blocked else 0.0)
            extra_time, caught = pass_time(rest)
            if caught:
                hit = "guard"
        event = {
            "t": "move",
            "x": round(x, 2),
            "y": round(y, 2),
            "d": round(travelled, 2),
            "s": round(walk_time + extra_time, 4),
            "walk": round(max(walk_time, MIN_COMMAND_TIME), 4),
            "blocked": blocked,
            "picked": picked,
        }
        events.append(event)
        if hit:
            finish("failed", hit)
        if all(c._collected for c in chips if not c.trapped):
            finish("solved", "chips")

    def finish_turn():
        elapsed, caught = pass_time(TURN_TIME)
        events.append({"t": "turn", "a": round(state["angle"], 2), "s": round(elapsed, 4)})
        if caught:
            finish("failed", "guard")

    def turn(degrees):
        degrees = _number(degrees, "turn")
        spend()
        state["angle"] += degrees
        finish_turn()

    def turn_to(target):
        x, y = _target(target, "turn_to")
        spend()
        if x == state["x"] and y == state["y"]:
            return
        wanted = math.degrees(math.atan2(y - state["y"], x - state["x"]))
        change = (wanted - state["angle"] + 180.0) % 360.0 - 180.0
        state["angle"] += change
        finish_turn()

    def wait(seconds):
        seconds = _number(seconds, "wait")
        if seconds < 0:
            raise ValueError("wait() can't use a negative number, but got %r" % (seconds,))
        spend()
        elapsed, caught = pass_time(seconds)
        events.append({"t": "wait", "s": round(elapsed, 4)})
        if caught:
            finish("failed", "guard")

    def distance_to(target):
        x, y = _target(target, "distance_to")
        return math.hypot(x - state["x"], y - state["y"])

    namespace = {
        "__name__": "__main__",
        "step": step,
        "turn": turn,
        "turn_to": turn_to,
        "distance_to": distance_to,
        "wait": wait,
        "chips": chips,
        "guards": guards,
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


def run_mission(encoded_payload):
    output = sys.stdout
    result = _run(json.loads(base64.b64decode(encoded_payload).decode("utf-8")))
    output.write("\n\x1eFSC" + json.dumps(result) + "\x1e\n")
    output.flush()
