import { IScene } from './format';

function toBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildRunCode(scenes: IScene[], code: string): string {
  const payload = toBase64(JSON.stringify({ scenes, code }));
  return (
    'from foxsnakecode.engine import run_mission\n' +
    `run_mission("${payload}")`
  );
}

export function buildLoadCode(): string {
  return 'from foxsnakecode.engine import load_missions\nload_missions()';
}

export type GameEvent = (
  | {
      t: 'move';
      who?: 'drone';
      x: number;
      y: number;
      d: number;
      s: number;
      walk: number;
      blocked: boolean;
      picked: { i: number; at: number }[];
      keys?: { i: number; at: number }[];
      intel?: number;
      battery?: number;
    }
  | { t: 'turn'; who?: 'drone'; a: number; s: number }
  | { t: 'wait'; s: number }
  | { t: 'launch'; x: number; y: number; a: number; battery: number; s: number }
  | { t: 'zap'; i: number; hazards: number[]; s: number }
  | { t: 'hack'; i: number; ok: boolean; s: number }
) & { line?: number };

export interface IRunResult {
  status: 'solved' | 'failed' | 'incomplete' | 'error' | 'stopped';
  reason?: string;
  events: GameEvent[];
  room?: number;
  line?: number;
  commands?: number;
  intel?: boolean;
  error?: {
    kind?: string;
    detail?: string;
    type?: string;
    message?: string;
    line?: number | null;
  };
  output?: string;
}

const RESULT_PATTERN = /\n?\x1eFSC([\s\S]*?)\x1e\n?/;

export function readRunOutput(stdout: string): IRunResult | null {
  const match = RESULT_PATTERN.exec(stdout);
  if (!match) {
    return null;
  }
  const result = JSON.parse(match[1]) as IRunResult;
  result.output = stdout.replace(RESULT_PATTERN, '');
  return result;
}

export function readMissionsOutput(stdout: string): string | null {
  return RESULT_PATTERN.exec(stdout)?.[1] ?? null;
}
