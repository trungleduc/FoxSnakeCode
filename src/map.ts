import { BOSS_BADGE } from './art';
import { IMission, isUnlocked } from './format';

const COLUMNS = 5;
const WIDTH = 1000;
const ROW_HEIGHT = 170;
const MARGIN = 100;

function position(index: number): { x: number; y: number } {
  const row = Math.floor(index / COLUMNS);
  const column = index % COLUMNS;
  const spacing = (WIDTH - 2 * MARGIN) / (COLUMNS - 1);
  return {
    x: MARGIN + spacing * (row % 2 ? COLUMNS - 1 - column : column),
    y: ROW_HEIGHT * (row + 0.5)
  };
}

export class MissionMap {
  constructor(onSelect: (index: number) => void) {
    this._onSelect = onSelect;
    this.node.className = 'fsc-map';
    this._title.className = 'fsc-map-title';
    this._message.className = 'fsc-map-message';
    this._message.setAttribute('role', 'status');
    this._path.className = 'fsc-map-path';
    this.node.append(this._title, this._message, this._path);
  }

  readonly node = document.createElement('div');

  setMessage(text: string): void {
    this._message.textContent = text;
  }

  render(mission: IMission, current: number): void {
    const { levels, progress } = mission;
    const height = Math.ceil(levels.length / COLUMNS) * ROW_HEIGHT;
    const solvedCount = progress.solved.length;
    this._title.textContent = `${mission.title}: ${solvedCount} / ${levels.length} solved`;
    this._path.style.aspectRatio = `${WIDTH} / ${height}`;

    const lines = levels.slice(1).map((_, index) => {
      const from = position(index);
      const to = position(index + 1);
      const done = progress.solved.includes(levels[index].id);
      return `<line class="fsc-map-line${done ? ' fsc-map-line-done' : ''}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
    });
    this._path.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${height}" aria-hidden="true">${lines.join('')}</svg>`;

    levels.forEach((level, index) => {
      const solved = progress.solved.includes(level.id);
      const unlocked = isUnlocked(mission, index);
      const state = solved ? 'solved' : unlocked ? 'open' : 'locked';
      const point = position(index);

      const stop = document.createElement('button');
      stop.className = `fsc-map-stop fsc-map-${state}`;
      stop.classList.toggle('fsc-map-boss', level.boss);
      stop.classList.toggle('fsc-map-current', index === current);
      stop.style.left = `${(point.x / WIDTH) * 100}%`;
      stop.style.top = `${(point.y / height) * 100}%`;
      stop.disabled = !unlocked;
      stop.setAttribute(
        'aria-label',
        `Level ${index + 1}: ${level.title}, ${state}`
      );
      stop.addEventListener('click', () => this._onSelect(index));

      if (level.boss) {
        stop.innerHTML = BOSS_BADGE;
      } else {
        stop.textContent = String(index + 1);
      }
      const label = document.createElement('span');
      label.className = 'fsc-map-label';
      label.textContent = level.title;
      stop.appendChild(label);
      this._path.appendChild(stop);
    });
  }

  show(): void {
    this.node.hidden = false;
    this._path
      .querySelector('.fsc-map-current')
      ?.scrollIntoView({ block: 'center' });
  }

  hide(): void {
    this.node.hidden = true;
  }

  private _onSelect: (index: number) => void;
  private _title = document.createElement('h2');
  private _message = document.createElement('p');
  private _path = document.createElement('div');
}
