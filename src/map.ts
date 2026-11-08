import { BOSS_BADGE, FOX_MARKUP, LOCK_BADGE, sudoSnakeAvatar } from './art';
import { IMission, isUnlocked } from './format';

const COLUMNS = 5;
const WIDTH = 1000;
const ROW_HEIGHT = 170;
const MARGIN = 100;
const SPLASH_FADE = 400;

let nextSplashId = 0;

function splashMarkup(): string {
  return `
  <div class="fsc-splash-content">
    <h1><span class="fsc-splash-fox">Fox</span><span class="fsc-splash-snake">Snake</span>Code</h1>
    <p class="fsc-splash-kicker">Tactical Coding Action</p>
    <p class="fsc-splash-pitch">Coding missions, challenges, stealth debugging, boss levels...</p>
    <p class="fsc-splash-tag">Write Python. Slip past the searchlights. Steal the data.</p>
    <h2>Meet the team</h2>
    <div class="fsc-splash-team">
      <div class="fsc-splash-card">
        <span class="fsc-splash-art" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-38 -44 76 76">${FOX_MARKUP}</svg></span>
        <div>
          <h3>Grep Fox</h3>
          <span class="fsc-splash-role fsc-splash-fox">Field agent</span>
          <p>Sniffs out any word, in any file, in a flash. Your code tells Grep Fox where to go.</p>
        </div>
      </div>
      <div class="fsc-splash-card">
        <span class="fsc-splash-art" aria-hidden="true">${sudoSnakeAvatar(`fsc-splash-clip-${++nextSplashId}`)}</span>
        <div>
          <h3>Sudo Snake</h3>
          <span class="fsc-splash-role fsc-splash-snake">HQ</span>
          <p>Sneaks past bugs and runs every command with superpowers. Briefs you on every mission.</p>
        </div>
      </div>
    </div>
    <div class="fsc-splash-action">
      <div class="fsc-splash-progress" role="progressbar" aria-label="Loading"><i></i></div>
      <button class="fsc-splash-start" hidden></button>
    </div>
    <p class="fsc-splash-error" role="alert"></p>
  </div>`;
}

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
    this._path.className = 'fsc-map-path';
    const header = document.createElement('div');
    header.className = 'fsc-map-header';
    header.append(this._title);
    this.node.append(header, this._path);
    this.splash.className = 'fsc-splash';
    this.splash.innerHTML = splashMarkup();
    this._splashStart = this.splash.querySelector(
      '.fsc-splash-start'
    ) as HTMLButtonElement;
    this._splashStart.addEventListener('click', () => this.hideSplash());
  }

  readonly node = document.createElement('div');
  readonly splash = document.createElement('div');

  showSplashStart(label: string): void {
    this.splash.classList.add('fsc-splash-ready');
    this._splashStart.textContent = label;
    this._splashStart.hidden = false;
    this._splashStart.focus();
  }

  showSplashError(text: string): void {
    this.splash.classList.add('fsc-splash-failed');
    const error = this.splash.querySelector('.fsc-splash-error');
    if (error) {
      error.textContent = text;
    }
  }

  hideSplash(): void {
    this.splash.classList.add('fsc-splash-out');
    window.setTimeout(() => {
      this.splash.hidden = true;
    }, SPLASH_FADE);
  }

  render(mission: IMission, current: number): void {
    const { levels, progress } = mission;
    const height = Math.ceil(levels.length / COLUMNS) * ROW_HEIGHT;
    const solvedCount = progress.solved.length;
    this._title.textContent = `${mission.title}: ${solvedCount} / ${levels.length} missions solved`;
    this._path.style.height = `${height}px`;

    const lines = levels.slice(1).map((_, index) => {
      const from = position(index);
      const to = position(index + 1);
      const done = progress.solved.includes(levels[index].id);
      return `<line class="fsc-map-line${done ? ' fsc-map-line-done' : ''}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
    });
    this._path.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${height}" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>`;

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
      stop.style.top = `${point.y}px`;
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
      if (!unlocked) {
        const lock = document.createElement('span');
        lock.className = 'fsc-map-lock';
        lock.innerHTML = LOCK_BADGE;
        stop.appendChild(lock);
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
  private _splashStart: HTMLButtonElement;
  private _title = document.createElement('h2');
  private _path = document.createElement('div');
}
