export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 500;

export type MascotId = 'fox' | 'snake';

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

export interface IScene {
  start: { x: number; y: number; angle: number };
  chips: IChip[];
  obstacles: IRect[];
  hazards: (IRect | ICircle)[];
}

export interface ILevel {
  title: string;
  instructions: string;
  starterCode: string;
  scene: IScene;
}

export interface IProgress {
  mascot: MascotId;
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

function list(value: unknown, where: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${where} must be a list.`);
  }
  return value;
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
    mascot: source.mascot === 'snake' ? 'snake' : 'fox',
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
    title: typeof raw.title === 'string' ? raw.title : 'Code Gear Solid',
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
