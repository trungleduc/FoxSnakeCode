import base64
import io
import json
import math
import os
import sys

WIDTH = 800
HEIGHT = 500
BODY_RADIUS = 14
DRONE_RADIUS = 10
HAZARD_RADIUS = 8
PICKUP_RADIUS = 24
REACH = 40
STRIDE = 2.0
WALK_SPEED = 240.0
DRONE_SPEED = 300.0
MIN_COMMAND_TIME = 0.07
BUMP_TIME = 0.26
TURN_TIME = 0.35
LAUNCH_TIME = 0.5
ZAP_TIME = 0.5
HACK_TIME = 0.6
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


def _record(name, fields):
    def init(self, **values):
        self._values = values

    def show(self):
        return "%s(%s)" % (name, ", ".join("%s=%r" % (field, getattr(self, field)) for field in fields))

    def getter(field):
        def read(self):
            value = self._values[field]
            if callable(value):
                return value()
            if isinstance(value, list):
                return list(value)
            return value
        return property(read)

    attributes = {"__init__": init, "__repr__": show, "__slots__": ("_values",)}
    for field in fields:
        attributes[field] = getter(field)
    return type(name, (), attributes)


Chip = _record("Chip", ("x", "y", "trapped", "collected"))
Guard = _record("Guard", ("x", "y", "angle"))
Key = _record("Key", ("x", "y", "color", "collected"))
Door = _record("Door", ("x", "y", "w", "h", "color", "open"))
Laser = _record("Laser", ("x", "y", "w", "h", "on"))
Terminal = _record("Terminal", ("x", "y", "data", "hacked"))
Fuse = _record("Fuse", ("x", "y", "zapped"))
Spot = _record("Spot", ("x", "y"))
Intel = _record("Intel", ("x", "y", "collected"))


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


def _guard_spots(guard, time, x, y, walls):
    guard_x, guard_y, angle = _guard_pose(guard, time)
    distance = math.hypot(x - guard_x, y - guard_y)
    if distance < GUARD_TOUCH:
        return True
    if distance > guard["sight"]:
        return False
    bearing = math.degrees(math.atan2(y - guard_y, x - guard_x))
    if abs((bearing - angle + 180.0) % 360.0 - 180.0) > guard["fov"] / 2.0:
        return False
    return not any(_line_hits_rect(guard_x, guard_y, x, y, r) for r in walls)


def _number(value, command):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError("%s() needs a number, but got %r" % (command, value))
    if not math.isfinite(value):
        raise ValueError("%s() needs a finite number, but got %r" % (command, value))
    return float(value)


def _target(value, command):
    if isinstance(value, (tuple, list)) and len(value) == 2:
        return _number(value[0], command), _number(value[1], command)
    if hasattr(value, "x") and hasattr(value, "y") and not isinstance(value, type):
        return _number(value.x, command), _number(value.y, command)
    raise TypeError("%s() needs a chip, a guard or an (x, y) pair, but got %r" % (command, value))


def _user_line():
    frame = sys._getframe(1)
    while frame is not None:
        if frame.f_code.co_filename == SOURCE:
            return frame.f_lineno
        frame = frame.f_back
    return None


def _same(given, wanted):
    if isinstance(wanted, list):
        return isinstance(given, (list, tuple)) and len(given) == len(wanted) and all(
            _same(a, b) for a, b in zip(given, wanted))
    if isinstance(wanted, (int, float)) and not isinstance(wanted, bool):
        return isinstance(given, (int, float)) and not isinstance(given, bool) and abs(given - wanted) < 1e-6
    return given == wanted


class Fox:
    __slots__ = ("_mission", "_who")

    def __init__(self, mission, who="fox"):
        self._mission = mission
        self._who = who

    x = property(lambda self: round(self._mission.body(self._who)["x"], 2))
    y = property(lambda self: round(self._mission.body(self._who)["y"], 2))
    angle = property(lambda self: round(self._mission.body(self._who)["angle"] % 360.0, 2))

    def step(self, distance):
        self._mission.move(self._who, distance)

    def turn(self, degrees):
        self._mission.turn(self._who, degrees)

    def turn_to(self, target):
        self._mission.turn_to(self._who, target)

    def distance_to(self, target):
        return self._mission.distance_to(self._who, target)

    def ahead(self):
        return self._mission.ahead(self._who)

    def wait(self, seconds):
        self._mission.wait(seconds)

    def __repr__(self):
        return "%s(x=%g, y=%g, angle=%g)" % (type(self).__name__, self.x, self.y, self.angle)


class Drone(Fox):
    __slots__ = ()

    battery = property(lambda self: round(self._mission.drone["battery"], 2))

    def zap(self):
        self._mission.zap()

    def __repr__(self):
        return "Drone(x=%g, y=%g, angle=%g, battery=%g)" % (self.x, self.y, self.angle, self.battery)


class _Mission:
    def __init__(self, scene):
        self.scene = scene
        start = scene["start"]
        self.fox = {"x": float(start["x"]), "y": float(start["y"]), "angle": float(start["angle"])}
        self.drone = None
        self.time = 0.0
        self.commands = 0
        self.line = None
        self.events = []
        self.result = {"status": "incomplete", "events": self.events}
        self.hazards = scene["hazards"]
        self.zapped = set()
        self.live = bool(scene["guards"]) or any("on" in h for h in self.hazards)
        self.chips = [Chip(x=c["x"], y=c["y"], trapped=bool(c.get("trapped")), collected=False) for c in scene["chips"]]
        self.keys = [Key(x=k["x"], y=k["y"], color=k["color"], collected=False) for k in scene.get("keys", [])]
        self.doors = [Door(x=d["x"], y=d["y"], w=d["w"], h=d["h"], color=d["color"], open=False) for d in scene.get("doors", [])]
        self.terminals = [Terminal(x=t["x"], y=t["y"], data=list(t["data"]), hacked=False) for t in scene.get("terminals", [])]
        self.fuses = [Fuse(x=f["x"], y=f["y"], zapped=False) for f in scene.get("fuses", [])]
        self.guards = [
            Guard(
                x=lambda g=g: round(_guard_pose(g, self.time)[0], 2),
                y=lambda g=g: round(_guard_pose(g, self.time)[1], 2),
                angle=lambda g=g: round(_guard_pose(g, self.time)[2] % 360.0, 2),
            )
            for g in scene["guards"]
        ]
        self.lasers = [
            Laser(x=h["x"], y=h["y"], w=h["w"], h=h["h"], on=lambda i=i, h=h: self.hazard_active(i, h))
            for i, h in enumerate(self.hazards) if "r" not in h
        ]
        exit_spot = scene.get("exit")
        self.exit_pad = Spot(x=exit_spot["x"], y=exit_spot["y"]) if exit_spot else None
        intel = scene.get("intel")
        self.intel = Intel(x=intel["x"], y=intel["y"], collected=False) if intel else None

    def body(self, who):
        if who == "drone":
            return self.drone
        return self.fox

    def spend(self):
        self.line = _user_line()
        self.commands += 1
        if self.commands > MAX_COMMANDS:
            raise _TooLong("commands")

    def finish(self, status, reason):
        self.result["status"] = status
        self.result["reason"] = reason
        if status == "failed" and self.line:
            self.result["line"] = self.line
        raise _Finished()

    def emit(self, event):
        if self.line:
            event["line"] = self.line
        self.events.append(event)

    def walls(self):
        return self.scene["obstacles"] + [d._values for d in self.doors if not d._values["open"]]

    def blocked_at(self, x, y, radius):
        if x < radius or y < radius or x > WIDTH - radius or y > HEIGHT - radius:
            return True
        return any(_circle_hits_rect(x, y, radius, r) for r in self.walls())

    def hazard_active(self, index, hazard):
        if index in self.zapped:
            return False
        if "on" in hazard:
            return self.time % (hazard["on"] + hazard["off"]) < hazard["on"]
        return True

    def hazard_at(self, x, y):
        for index, hazard in enumerate(self.hazards):
            if not self.hazard_active(index, hazard):
                continue
            if "r" in hazard:
                if math.hypot(x - hazard["x"], y - hazard["y"]) < hazard["r"] + HAZARD_RADIUS:
                    return "light"
            elif _circle_hits_rect(x, y, HAZARD_RADIUS, hazard):
                return "laser"
        return None

    def danger(self):
        hit = self.hazard_at(self.fox["x"], self.fox["y"])
        if hit:
            return hit
        if not self.scene["guards"]:
            return None
        if self.time > MAX_GUARD_TIME:
            raise _TooLong("time")
        walls = self.walls()
        for guard in self.scene["guards"]:
            if _guard_spots(guard, self.time, self.fox["x"], self.fox["y"], walls):
                return "guard"
            if self.drone and _guard_spots(guard, self.time, self.drone["x"], self.drone["y"], walls):
                return "drone"
        return None

    def pass_time(self, seconds):
        if not self.live:
            self.time += seconds
            return seconds, None
        elapsed = 0.0
        while elapsed < seconds:
            tick = min(GUARD_TICK, seconds - elapsed)
            elapsed += tick
            self.time += tick
            hit = self.danger()
            if hit:
                return elapsed, hit
        return elapsed, None

    def won(self):
        if not all(c._values["collected"] for c in self.chips if not c._values["trapped"]):
            return False
        if self.exit_pad is None:
            return True
        spot = self.scene["exit"]
        return math.hypot(self.fox["x"] - spot["x"], self.fox["y"] - spot["y"]) < PICKUP_RADIUS

    def pick_up(self, travelled, event):
        x, y = self.fox["x"], self.fox["y"]
        hit = None
        for index, chip in enumerate(self.chips):
            values = chip._values
            if not values["collected"] and math.hypot(x - values["x"], y - values["y"]) < PICKUP_RADIUS:
                values["collected"] = True
                event["picked"].append({"i": index, "at": round(travelled, 2)})
                if values["trapped"]:
                    hit = "trap"
        for index, key in enumerate(self.keys):
            values = key._values
            if not values["collected"] and math.hypot(x - values["x"], y - values["y"]) < PICKUP_RADIUS:
                values["collected"] = True
                event.setdefault("keys", []).append({"i": index, "at": round(travelled, 2)})
                self.open_doors(values["color"])
        if self.intel and not self.intel._values["collected"]:
            values = self.intel._values
            if math.hypot(x - values["x"], y - values["y"]) < PICKUP_RADIUS:
                values["collected"] = True
                event["intel"] = round(travelled, 2)
        return hit

    def open_doors(self, color):
        for door in self.doors:
            if door._values["color"] == color:
                door._values["open"] = True

    def move(self, who, distance):
        distance = _number(distance, "step")
        if who == "drone" and not self.drone:
            raise RuntimeError("The drone has not been launched.")
        self.spend()
        body = self.body(who)
        radius, speed = (DRONE_RADIUS, DRONE_SPEED) if who == "drone" else (BODY_RADIUS, WALK_SPEED)
        heading = math.radians(body["angle"])
        direction = 1.0 if distance >= 0 else -1.0
        dx, dy = math.cos(heading) * direction, math.sin(heading) * direction
        remaining = abs(distance)
        if who == "drone":
            remaining = min(remaining, body["battery"])
        travelled = 0.0
        blocked = False
        hit = None
        won = False
        event = {"t": "move", "picked": []}
        if who == "drone":
            event["who"] = "drone"
        while remaining > 0:
            stride = min(STRIDE, remaining)
            next_x, next_y = body["x"] + dx * stride, body["y"] + dy * stride
            if self.blocked_at(next_x, next_y, radius):
                blocked = True
                break
            body["x"], body["y"] = next_x, next_y
            self.time += stride / speed
            remaining -= stride
            travelled += stride
            if who == "drone":
                body["battery"] = max(body["battery"] - stride, 0.0)
            else:
                hit = self.hazard_at(body["x"], body["y"]) or self.pick_up(travelled, event)
            if not hit and self.live:
                hit = self.danger()
            if hit:
                break
            if who == "fox" and self.won():
                won = True
                break
        walk_time = travelled / speed
        extra_time = 0.0
        if not hit and not won:
            rest = max(MIN_COMMAND_TIME - walk_time, 0.0) + (BUMP_TIME if blocked else 0.0)
            extra_time, hit = self.pass_time(rest)
        event.update({
            "x": round(body["x"], 2),
            "y": round(body["y"], 2),
            "d": round(travelled, 2),
            "s": round(walk_time + extra_time, 4),
            "walk": round(max(walk_time, MIN_COMMAND_TIME), 4),
            "blocked": blocked,
        })
        if who == "drone":
            event["battery"] = round(body["battery"], 2)
        self.emit(event)
        if hit:
            self.finish("failed", hit)
        if won:
            self.finish("solved", "chips")

    def finish_turn(self, who, seconds=TURN_TIME):
        elapsed, hit = self.pass_time(seconds)
        event = {"t": "turn", "a": round(self.body(who)["angle"], 2), "s": round(elapsed, 4)}
        if who == "drone":
            event["who"] = "drone"
        self.emit(event)
        if hit:
            self.finish("failed", hit)

    def turn(self, who, degrees):
        degrees = _number(degrees, "turn")
        if who == "drone" and not self.drone:
            raise RuntimeError("The drone has not been launched.")
        self.spend()
        self.body(who)["angle"] += degrees
        self.finish_turn(who)

    def turn_to(self, who, target):
        x, y = _target(target, "turn_to")
        if who == "drone" and not self.drone:
            raise RuntimeError("The drone has not been launched.")
        self.spend()
        body = self.body(who)
        if x == body["x"] and y == body["y"]:
            return
        wanted = math.degrees(math.atan2(y - body["y"], x - body["x"]))
        body["angle"] += (wanted - body["angle"] + 180.0) % 360.0 - 180.0
        self.finish_turn(who)

    def wait(self, seconds):
        seconds = _number(seconds, "wait")
        if seconds < 0:
            raise ValueError("wait() can't use a negative number, but got %r" % (seconds,))
        self.spend()
        elapsed, hit = self.pass_time(seconds)
        self.emit({"t": "wait", "s": round(elapsed, 4)})
        if hit:
            self.finish("failed", hit)

    def distance_to(self, who, target):
        x, y = _target(target, "distance_to")
        body = self.body(who)
        return math.hypot(x - body["x"], y - body["y"])

    def ahead(self, who):
        body = self.body(who)
        radius = DRONE_RADIUS if who == "drone" else BODY_RADIUS
        heading = math.radians(body["angle"])
        dx, dy = math.cos(heading), math.sin(heading)
        distance = 0.0
        while not self.blocked_at(body["x"] + dx * (distance + STRIDE), body["y"] + dy * (distance + STRIDE), radius):
            distance += STRIDE
        return distance

    def has_key(self, color):
        return any(k._values["collected"] and k._values["color"] == color for k in self.keys)

    def nearest(self, things, body):
        for index, thing in enumerate(things):
            values = thing._values
            if math.hypot(body["x"] - values["x"], body["y"] - values["y"]) < REACH:
                return index, values
        return None, None

    def hack(self, answer):
        index, terminal = self.nearest(self.terminals, self.fox)
        if terminal is None:
            raise RuntimeError("hack() only works when Grep Fox is next to a terminal.")
        self.spend()
        source = self.scene["terminals"][index]
        correct = terminal["hacked"] or _same(answer, source["answer"])
        elapsed, hit = self.pass_time(HACK_TIME)
        self.emit({"t": "hack", "i": index, "ok": correct, "s": round(elapsed, 4)})
        if not correct:
            self.finish("failed", "hack")
        terminal["hacked"] = True
        self.open_doors(source["color"])
        if hit:
            self.finish("failed", hit)

    def launch_drone(self):
        config = self.scene.get("drone")
        if not config:
            raise RuntimeError("There is no drone on this mission.")
        if self.drone:
            raise RuntimeError("The drone is already out.")
        self.spend()
        self.drone = {"x": self.fox["x"], "y": self.fox["y"], "angle": self.fox["angle"], "battery": float(config["battery"])}
        elapsed, hit = self.pass_time(LAUNCH_TIME)
        self.emit({
            "t": "launch",
            "x": round(self.drone["x"], 2),
            "y": round(self.drone["y"], 2),
            "a": round(self.drone["angle"], 2),
            "battery": self.drone["battery"],
            "s": round(elapsed, 4),
        })
        if hit:
            self.finish("failed", hit)
        return Drone(self, "drone")

    def zap(self):
        index, fuse = self.nearest(self.fuses, self.drone)
        if fuse is None:
            raise RuntimeError("zap() only works when the drone is next to a fuse box.")
        self.spend()
        fuse["zapped"] = True
        hazards = self.scene["fuses"][index]["hazards"]
        self.zapped.update(hazards)
        elapsed, hit = self.pass_time(ZAP_TIME)
        self.emit({"t": "zap", "i": index, "hazards": hazards, "s": round(elapsed, 4)})
        if hit:
            self.finish("failed", hit)


def _run(scene, code):
    mission = _Mission(scene)
    fox = Fox(mission)
    result = mission.result
    namespace = {
        "__name__": "__main__",
        "step": fox.step,
        "turn": fox.turn,
        "turn_to": fox.turn_to,
        "distance_to": fox.distance_to,
        "ahead": fox.ahead,
        "wait": fox.wait,
        "has_key": mission.has_key,
        "hack": mission.hack,
        "launch_drone": mission.launch_drone,
        "fox": fox,
        "chips": mission.chips,
        "guards": mission.guards,
        "keys": mission.keys,
        "doors": mission.doors,
        "lasers": mission.lasers,
        "terminals": mission.terminals,
        "fuses": mission.fuses,
        "exit_pad": mission.exit_pad,
        "intel": mission.intel,
    }
    namespace.update(scene.get("values", {}))
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
        compiled = compile(code, SOURCE, "exec")
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
    result["commands"] = mission.commands
    result["intel"] = bool(mission.intel and mission.intel._values["collected"])
    return result


def _run_rooms(scenes, code):
    commands = 0
    intel = True
    printed = ""
    for room, scene in enumerate(scenes):
        captured = io.StringIO()
        output = sys.stdout
        sys.stdout = captured
        try:
            result = _run(scene, code)
        finally:
            sys.stdout = output
        printed = captured.getvalue()
        commands = max(commands, result["commands"])
        if scene.get("intel") and not result["intel"]:
            intel = False
        if result["status"] != "solved":
            break
    result["room"] = room
    if result["status"] == "solved":
        result["commands"] = commands
        result["intel"] = intel and any(scene.get("intel") for scene in scenes)
    return result, printed


def _send(output, text):
    output.write("\n\x1eFSC" + text + "\x1e\n")
    output.flush()


def run_mission(encoded_payload):
    output = sys.stdout
    payload = json.loads(base64.b64decode(encoded_payload).decode("utf-8"))
    result, printed = _run_rooms(payload["scenes"], payload["code"])
    output.write(printed)
    _send(output, json.dumps(result))


def load_missions():
    path = os.path.join(os.path.dirname(__file__), "missions.json")
    with open(path, encoding="utf-8") as file:
        _send(sys.stdout, file.read())
