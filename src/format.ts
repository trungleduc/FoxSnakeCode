export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 500;
const GUARD_SIGHT = 160;
const GUARD_FOV = 70;
const GUARD_TURN_SPEED = 180;

export interface IChip {
  x: number;
  y: number;
  trapped?: boolean;
}

export interface IRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ICircle {
  x: number;
  y: number;
  r: number;
}

export interface IPoint {
  x: number;
  y: number;
}

export interface IGuardLeg {
  t0: number;
  t1: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  a0: number;
  a1: number;
}

export interface IGuard {
  route: IPoint[];
  speed: number;
  sight: number;
  fov: number;
  legs: IGuardLeg[];
  period: number;
}

export interface IGuardPose extends IPoint {
  angle: number;
}

export interface IScene {
  start: { x: number; y: number; angle: number };
  chips: IChip[];
  obstacles: IRect[];
  hazards: (IRect | ICircle)[];
  guards: IGuard[];
}

export interface ILevel {
  title: string;
  instructions: string;
  starterCode: string;
  scene: IScene;
}

export interface IProgress {
  currentLevel: number;
  solved: number[];
  code: Record<string, string>;
}

export interface IMission {
  title: string;
  levels: ILevel[];
  progress: IProgress;
  raw: Record<string, unknown>;
}

export function isCircle(hazard: IRect | ICircle): hazard is ICircle {
  return 'r' in hazard;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function numbers(
  source: Record<string, unknown>,
  keys: string[],
  where: string
): number[] {
  return keys.map(key => {
    const value = source[key];
    if (!isNumber(value)) {
      throw new Error(`${where}: "${key}" must be a number.`);
    }
    return value;
  });
}

function parseRect(value: unknown, where: string): IRect {
  const source = asObject(value, where);
  const [x, y, w, h] = numbers(source, ['x', 'y', 'w', 'h'], where);
  return { x, y, w, h };
}

function parseHazard(value: unknown, where: string): IRect | ICircle {
  const source = asObject(value, where);
  if ('r' in source) {
    const [x, y, r] = numbers(source, ['x', 'y', 'r'], where);
    return { x, y, r };
  }
  return parseRect(source, where);
}

function headingBetween(from: IPoint, to: IPoint): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function shortestTurn(change: number): number {
  return (((change + 180) % 360) + 360) % 360 - 180;
}

function guardLegs(
  route: IPoint[],
  speed: number
): { legs: IGuardLeg[]; period: number } {
  const legs: IGuardLeg[] = [];
  let time = 0;
  let angle = headingBetween(route[0], route[1]);
  const add = (duration: number, from: IPoint, to: IPoint, end: number) => {
    if (duration > 0) {
      legs.push({
        t0: time,
        t1: time + duration,
        x0: from.x,
        y0: from.y,
        x1: to.x,
        y1: to.y,
        a0: angle,
        a1: end
      });
    }
    time += duration;
    angle = end;
  };
  const turnTo = (at: IPoint, to: IPoint) => {
    const change = shortestTurn(headingBetween(at, to) - angle);
    add(Math.abs(change) / GUARD_TURN_SPEED, at, at, angle + change);
  };
  route.forEach((from, index) => {
    const to = route[(index + 1) % route.length];
    turnTo(from, to);
    add(Math.hypot(to.x - from.x, to.y - from.y) / speed, from, to, angle);
  });
  turnTo(route[0], route[1]);
  return { legs, period: time };
}

export function guardPose(guard: IGuard, time: number): IGuardPose {
  const moment = time % guard.period;
  const leg =
    guard.legs.find(item => moment < item.t1) ??
    guard.legs[guard.legs.length - 1];
  const progress = (moment - leg.t0) / (leg.t1 - leg.t0);
  return {
    x: leg.x0 + (leg.x1 - leg.x0) * progress,
    y: leg.y0 + (leg.y1 - leg.y0) * progress,
    angle: leg.a0 + (leg.a1 - leg.a0) * progress
  };
}

function list(value: unknown, where: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${where} must be a list.`);
  }
  return value;
}

function parseGuard(value: unknown, where: string): IGuard {
  const source = asObject(value, where);
  const [speed] = numbers(source, ['speed'], where);
  if (speed <= 0) {
    throw new Error(`${where}: "speed" must be more than 0.`);
  }
  const route = list(source.route, `${where}.route`).map((item, index) => {
    const pointWhere = `${where}.route[${index}]`;
    const [x, y] = numbers(asObject(item, pointWhere), ['x', 'y'], pointWhere);
    return { x, y };
  });
  if (new Set(route.map(point => `${point.x},${point.y}`)).size < 2) {
    throw new Error(`${where}.route needs at least two different points.`);
  }
  return {
    route,
    speed,
    sight: GUARD_SIGHT,
    fov: GUARD_FOV,
    ...guardLegs(route, speed)
  };
}

function parseScene(value: unknown, where: string): IScene {
  const source = asObject(value, where);
  const start = asObject(source.start, `${where}.start`);
  const [x, y] = numbers(start, ['x', 'y'], `${where}.start`);
  const angle = start.angle === undefined ? 0 : start.angle;
  if (!isNumber(angle)) {
    throw new Error(`${where}.start: "angle" must be a number.`);
  }
  const chips = list(source.chips, `${where}.chips`).map((item, index) => {
    const chipWhere = `${where}.chips[${index}]`;
    const chip = asObject(item, chipWhere);
    const [chipX, chipY] = numbers(chip, ['x', 'y'], chipWhere);
    return { x: chipX, y: chipY, trapped: chip.trapped === true };
  });
  if (!chips.some(chip => !chip.trapped)) {
    throw new Error(`${where} needs at least one chip that is not trapped.`);
  }
  return {
    start: { x, y, angle },
    chips,
    obstacles: list(source.obstacles, `${where}.obstacles`).map((item, index) =>
      parseRect(item, `${where}.obstacles[${index}]`)
    ),
    hazards: list(source.hazards, `${where}.hazards`).map((item, index) =>
      parseHazard(item, `${where}.hazards[${index}]`)
    ),
    guards: list(source.guards, `${where}.guards`).map((item, index) =>
      parseGuard(item, `${where}.guards[${index}]`)
    )
  };
}

function parseLevel(value: unknown, where: string): ILevel {
  const source = asObject(value, where);
  return {
    title: typeof source.title === 'string' ? source.title : where,
    instructions:
      typeof source.instructions === 'string' ? source.instructions : '',
    starterCode:
      typeof source.starterCode === 'string' ? source.starterCode : '',
    scene: parseScene(source.scene, `${where}.scene`)
  };
}

function parseProgress(value: unknown, levelCount: number): IProgress {
  const source =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const current = source.currentLevel;
  const code: Record<string, string> = {};
  if (typeof source.code === 'object' && source.code !== null) {
    for (const [key, text] of Object.entries(source.code)) {
      if (typeof text === 'string') {
        code[key] = text;
      }
    }
  }
  return {
    currentLevel:
      Number.isInteger(current) &&
      (current as number) >= 0 &&
      (current as number) < levelCount
        ? (current as number)
        : 0,
    solved: Array.isArray(source.solved)
      ? source.solved.filter(
          (item): item is number =>
            Number.isInteger(item) && item >= 0 && item < levelCount
        )
      : [],
    code
  };
}

export function parseMission(text: string): IMission {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`This file is not valid JSON: ${(error as Error).message}`);
  }
  const raw = asObject(parsed, 'The file');
  const levelSources = raw.levels === undefined ? [raw] : raw.levels;
  if (!Array.isArray(levelSources) || levelSources.length === 0) {
    throw new Error('"levels" must be a list with at least one level.');
  }
  const levels = levelSources.map((level, index) =>
    parseLevel(level, `Level ${index + 1}`)
  );
  return {
    title: typeof raw.title === 'string' ? raw.title : 'FoxSnakeCode',
    levels,
    progress: parseProgress(raw.progress, levels.length),
    raw
  };
}

export function serializeMission(mission: IMission): string {
  return (
    JSON.stringify({ ...mission.raw, progress: mission.progress }, null, 2) +
    '\n'
  );
}
