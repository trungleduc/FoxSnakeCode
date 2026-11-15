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

export interface ILaser extends IRect {
  on?: number;
  off?: number;
}

export interface IDoor extends IRect {
  color: string;
}

export interface IKey {
  x: number;
  y: number;
  color: string;
}

export interface ITerminal {
  x: number;
  y: number;
  data: unknown[];
  answer: unknown;
  color: string;
}

export interface IFuse {
  x: number;
  y: number;
  hazards: number[];
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
  hazards: (ILaser | ICircle)[];
  guards: IGuard[];
  doors: IDoor[];
  keys: IKey[];
  terminals: ITerminal[];
  fuses: IFuse[];
  exit?: IPoint;
  intel?: IPoint;
  drone?: { battery: number };
  values?: Record<string, number>;
}

export interface IPar {
  lines?: number;
  commands?: number;
}

export interface ILevel {
  id: string;
  title: string;
  boss: boolean;
  instructions: string;
  starterCode: string;
  scene: IScene;
  variants: IScene[];
  par: IPar;
  gadget?: string;
  hints: string[];
}

export interface IProgress {
  currentLevel: string;
  solved: string[];
  code: Record<string, string>;
  stars: Record<string, number>;
  intel: string[];
}

export interface IMission {
  title: string;
  chapters: string[];
  levels: ILevel[];
  progress: IProgress;
}

export function isCircle(hazard: ILaser | ICircle): hazard is ICircle {
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

function parseHazard(value: unknown, where: string): ILaser | ICircle {
  const source = asObject(value, where);
  if ('r' in source) {
    const [x, y, r] = numbers(source, ['x', 'y', 'r'], where);
    return { x, y, r };
  }
  const laser: ILaser = parseRect(source, where);
  if ('on' in source || 'off' in source) {
    const [on, off] = numbers(source, ['on', 'off'], where);
    if (on <= 0 || off <= 0) {
      throw new Error(`${where}: "on" and "off" must be more than 0.`);
    }
    laser.on = on;
    laser.off = off;
  }
  return laser;
}

function parsePoint(value: unknown, where: string): IPoint {
  const [x, y] = numbers(asObject(value, where), ['x', 'y'], where);
  return { x, y };
}

function color(source: Record<string, unknown>, where: string): string {
  if (typeof source.color !== 'string' || !source.color) {
    throw new Error(`${where}: "color" must be a non-empty string.`);
  }
  return source.color;
}

export function laserOn(laser: ILaser, time: number): boolean {
  return laser.on === undefined || laser.off === undefined
    ? true
    : time % (laser.on + laser.off) < laser.on;
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
  const hazards = list(source.hazards, `${where}.hazards`).map((item, index) =>
    parseHazard(item, `${where}.hazards[${index}]`)
  );
  const scene: IScene = {
    start: { x, y, angle },
    chips,
    obstacles: list(source.obstacles, `${where}.obstacles`).map((item, index) =>
      parseRect(item, `${where}.obstacles[${index}]`)
    ),
    hazards,
    guards: list(source.guards, `${where}.guards`).map((item, index) =>
      parseGuard(item, `${where}.guards[${index}]`)
    ),
    doors: list(source.doors, `${where}.doors`).map((item, index) => {
      const doorWhere = `${where}.doors[${index}]`;
      const door = asObject(item, doorWhere);
      return { ...parseRect(door, doorWhere), color: color(door, doorWhere) };
    }),
    keys: list(source.keys, `${where}.keys`).map((item, index) => {
      const keyWhere = `${where}.keys[${index}]`;
      const key = asObject(item, keyWhere);
      return { ...parsePoint(key, keyWhere), color: color(key, keyWhere) };
    }),
    terminals: list(source.terminals, `${where}.terminals`).map(
      (item, index) => {
        const terminalWhere = `${where}.terminals[${index}]`;
        const terminal = asObject(item, terminalWhere);
        if (!('answer' in terminal)) {
          throw new Error(`${terminalWhere}: "answer" is missing.`);
        }
        return {
          ...parsePoint(terminal, terminalWhere),
          data: list(terminal.data, `${terminalWhere}.data`),
          answer: terminal.answer,
          color: color(terminal, terminalWhere)
        };
      }
    ),
    fuses: list(source.fuses, `${where}.fuses`).map((item, index) => {
      const fuseWhere = `${where}.fuses[${index}]`;
      const fuse = asObject(item, fuseWhere);
      const links = list(fuse.hazards, `${fuseWhere}.hazards`);
      if (
        !links.every(
          link => Number.isInteger(link) && hazards[link as number] !== undefined
        )
      ) {
        throw new Error(`${fuseWhere}: "hazards" must list hazard positions.`);
      }
      return { ...parsePoint(fuse, fuseWhere), hazards: links as number[] };
    })
  };
  if (source.exit !== undefined) {
    scene.exit = parsePoint(source.exit, `${where}.exit`);
  }
  if (source.intel !== undefined) {
    scene.intel = parsePoint(source.intel, `${where}.intel`);
  }
  if (source.values !== undefined) {
    const values = asObject(source.values, `${where}.values`);
    const names = Object.keys(values);
    if (!names.every(name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
      throw new Error(`${where}.values: names must be valid Python names.`);
    }
    scene.values = Object.fromEntries(
      names.map((name, index) => [
        name,
        numbers(values, names, `${where}.values`)[index]
      ])
    );
  }
  if (source.drone !== undefined) {
    const [battery] = numbers(
      asObject(source.drone, `${where}.drone`),
      ['battery'],
      `${where}.drone`
    );
    scene.drone = { battery };
  }
  return scene;
}

function parsePar(value: unknown, where: string): IPar {
  if (value === undefined) {
    return {};
  }
  const source = asObject(value, where);
  const par: IPar = {};
  for (const key of ['lines', 'commands'] as const) {
    if (source[key] !== undefined) {
      [par[key]] = numbers(source, [key], where);
    }
  }
  return par;
}

function parseLevel(value: unknown, where: string): ILevel {
  const source = asObject(value, where);
  if (typeof source.id !== 'string' || !source.id) {
    throw new Error(`${where}: "id" must be a non-empty string.`);
  }
  return {
    id: source.id,
    title: typeof source.title === 'string' ? source.title : where,
    boss: source.boss === true,
    instructions:
      typeof source.instructions === 'string' ? source.instructions : '',
    starterCode:
      typeof source.starterCode === 'string' ? source.starterCode : '',
    scene: parseScene(source.scene, `${where}.scene`),
    variants: list(source.variants, `${where}.variants`).map((item, index) =>
      parseScene(item, `${where}.variants[${index}]`)
    ),
    par: parsePar(source.par, `${where}.par`),
    gadget: typeof source.gadget === 'string' ? source.gadget : undefined,
    hints: list(source.hints, `${where}.hints`).filter(
      (hint): hint is string => typeof hint === 'string'
    )
  };
}

function parseProgress(value: unknown, levels: ILevel[]): IProgress {
  const ids = new Set(levels.map(level => level.id));
  const source =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const current = source.currentLevel;
  const code: Record<string, string> = {};
  const stars: Record<string, number> = {};
  if (typeof source.stars === 'object' && source.stars !== null) {
    for (const [key, count] of Object.entries(source.stars)) {
      if (ids.has(key) && isNumber(count)) {
        stars[key] = count;
      }
    }
  }
  if (typeof source.code === 'object' && source.code !== null) {
    for (const [key, text] of Object.entries(source.code)) {
      if (typeof text === 'string') {
        code[key] = text;
      }
    }
  }
  return {
    currentLevel:
      typeof current === 'string' && ids.has(current) ? current : levels[0].id,
    solved: Array.isArray(source.solved)
      ? source.solved.filter(
          (item): item is string => typeof item === 'string' && ids.has(item)
        )
      : [],
    code,
    stars,
    intel: Array.isArray(source.intel)
      ? source.intel.filter(
          (item): item is string => typeof item === 'string' && ids.has(item)
        )
      : []
  };
}

function parseSave(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`This file is not valid JSON: ${(error as Error).message}`);
  }
  return asObject(parsed, 'The file');
}

export function parseMission(missions: string, save: string): IMission {
  const source = asObject(JSON.parse(missions), 'The missions');
  const levels = list(source.levels, 'The missions').map((level, index) =>
    parseLevel(level, `Level ${index + 1}`)
  );
  if (levels.length === 0) {
    throw new Error('"levels" must be a list with at least one level.');
  }
  return {
    title: typeof source.title === 'string' ? source.title : 'FoxSnakeCode',
    chapters: list(source.chapters, 'The chapters').filter(
      (name): name is string => typeof name === 'string'
    ),
    levels,
    progress: parseProgress(parseSave(save).progress, levels)
  };
}

export function serializeMission(mission: IMission): string {
  return JSON.stringify({ progress: mission.progress }, null, 2) + '\n';
}

export function countLines(code: string): number {
  return code
    .split('\n')
    .filter(line => line.trim() && !line.trim().startsWith('#')).length;
}

export function starsFor(par: IPar, lines: number, commands: number): number {
  return (
    1 +
    (par.lines === undefined || lines <= par.lines ? 1 : 0) +
    (par.commands === undefined || commands <= par.commands ? 1 : 0)
  );
}

export function unlockedGadgets(mission: IMission): Set<string> {
  return new Set(
    mission.levels
      .filter(
        level => level.gadget && mission.progress.solved.includes(level.id)
      )
      .map(level => level.gadget as string)
  );
}

export function isUnlocked(mission: IMission, index: number): boolean {
  const { levels, progress } = mission;
  return (
    index === 0 ||
    progress.solved.includes(levels[index].id) ||
    progress.solved.includes(levels[index - 1].id)
  );
}
