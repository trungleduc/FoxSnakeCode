import { IScene } from './format';

function toBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildRunCode(scene: IScene, code: string): string {
  const payload = toBase64(JSON.stringify({ scene, code }));
  return (
    'from foxsnakecode.engine import run_mission\n' +
    `run_mission("${payload}")`
  );
}

export type GameEvent =
  | {
      t: 'move';
      x: number;
      y: number;
      d: number;
      s: number;
      walk: number;
      blocked: boolean;
      picked: { i: number; at: number }[];
    }
  | { t: 'turn'; a: number; s: number }
  | { t: 'wait'; s: number };

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
