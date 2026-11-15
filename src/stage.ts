import { FOX_MARKUP, sceneMarkup, visionCone } from './art';
import { GameAudio } from './audio';
import { GameEvent } from './engine';
import {
  guardPose,
  IRect,
  IScene,
  isCircle,
  laserOn,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './format';

const TURN_SPEED = 360;
const BUMP_TIME = 260;
const MAX_PLAY_TIME = 30000;
const FOOTSTEP_DISTANCE = 45;
const CARD_GAP = 6;

const SVG_NS = 'http://www.w3.org/2000/svg';

let nextStageId = 0;

interface IPose {
  x: number;
  y: number;
  angle: number;
}

interface IPoses {
  fox: IPose;
  drone: IPose;
}

export class Stage {
  readonly node: SVGSVGElement;
  readonly card: HTMLDivElement;

  constructor(
    onChips: (collected: number, total: number) => void,
    audio: GameAudio
  ) {
    this._id = `fsc-stage-${++nextStageId}`;
    this._onChips = onChips;
    this._audio = audio;
    this.node = document.createElementNS(SVG_NS, 'svg');
    this.node.setAttribute('viewBox', `0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`);
    this.node.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.node.setAttribute('role', 'img');
    this.node.classList.add('fsc-scene');
    this.card = document.createElement('div');
    this.card.className = 'fsc-chip-card';
    this.card.hidden = true;
    this.node.addEventListener('pointerover', event => {
      this._showCard(
        (event.target as Element).closest(
          '[data-card]:not(.fsc-chip-taken):not(.fsc-taken)'
        )
      );
    });
    this.node.addEventListener('pointerleave', () => this._hideCard());
  }

  load(scene: IScene): void {
    this.stop();
    this._scene = scene;
    this.node.innerHTML = sceneMarkup(scene, this._id);
    this._actor = this.node.querySelector('.fsc-actor') as SVGGElement;
    this._drone = this.node.querySelector('.fsc-drone') as SVGGElement;
    this._guardNodes = Array.from(this.node.querySelectorAll('.fsc-guard'));
    this._guardFacing = this._guardNodes.map(() => 1);
    this.reset();
  }

  reset(): void {
    this.stop();
    this._hideCard();
    const scene = this._scene;
    if (!scene) {
      return;
    }
    this._fox = { x: scene.start.x, y: scene.start.y, angle: scene.start.angle };
    this._dronePose = { ...this._fox };
    this._battery = 0;
    this._batteryFull = 1;
    this._collected = 0;
    this._openColors.clear();
    this._zapped.clear();
    this._facing = Math.cos((this._fox.angle * Math.PI) / 180) < -0.01 ? -1 : 1;
    this.setOutcome(null);
    this.node
      .querySelectorAll('.fsc-chip-taken')
      .forEach(chip => chip.classList.remove('fsc-chip-taken'));
    this.node
      .querySelectorAll('.fsc-taken, .fsc-open, .fsc-zapped, .fsc-hacked, .fsc-denied')
      .forEach(item =>
        item.classList.remove(
          'fsc-taken',
          'fsc-open',
          'fsc-zapped',
          'fsc-hacked',
          'fsc-denied'
        )
      );
    if (this._drone) {
      this._drone.setAttribute('hidden', '');
    }
    this._drawActorMarkup();
    this._drawPose();
    this._drawTimed(0);
    this._reportChips();
  }

  setOutcome(outcome: 'win' | 'fail' | 'spotted' | null): void {
    this.node.classList.toggle('fsc-win', outcome === 'win');
    this.node.classList.toggle(
      'fsc-fail',
      outcome === 'fail' || outcome === 'spotted'
    );
    this.node.classList.toggle('fsc-spotted', outcome === 'spotted');
  }

  play(events: GameEvent[]): Promise<void> {
    this.stop();
    const durations = events.map(event => this._duration(event));
    const total = durations.reduce((sum, time) => sum + time, 0);
    const rate = total > MAX_PLAY_TIME ? total / MAX_PLAY_TIME : 1;
    this.node.classList.add('fsc-patrolling');
    return new Promise<void>(resolve => {
      this._finishPlay = resolve;
      let index = 0;
      let eventTime = 0;
      let finishedTime = 0;
      let from = this._poses();
      let last: number | null = null;
      let announced = -1;
      const tick = (now: number) => {
        let budget = last === null ? 0 : (now - last) * rate;
        last = now;
        while (index < events.length) {
          const event = events[index];
          if (index !== announced) {
            announced = index;
            this._startEvent(event, from);
          }
          const duration = durations[index];
          const left = duration - eventTime;
          const used = Math.min(left, budget);
          eventTime += used;
          budget -= used;
          this._applyEvent(event, from, duration ? eventTime / duration : 1);
          if (eventTime < duration) {
            break;
          }
          this._finishEvent(event);
          from = this._poses();
          index++;
          finishedTime += eventTime;
          eventTime = 0;
        }
        this._drawPose();
        this._drawTimed((finishedTime + eventTime) / 1000);
        if (index >= events.length) {
          this._setWalking(false);
          this.node.classList.remove('fsc-patrolling');
          this._frame = 0;
          this._finishPlay = null;
          resolve();
          return;
        }
        this._frame = requestAnimationFrame(tick);
      };
      this._frame = requestAnimationFrame(tick);
    });
  }

  stop(): void {
    if (this._frame) {
      cancelAnimationFrame(this._frame);
      this._frame = 0;
    }
    this._setWalking(false);
    this.node.classList.remove('fsc-patrolling');
    clearTimeout(this._bumpTimer);
    this.node.classList.remove('fsc-bump');
    const finish = this._finishPlay;
    this._finishPlay = null;
    finish?.();
  }

  private _duration(event: GameEvent): number {
    return event.s * 1000;
  }

  private _poses(): IPoses {
    return { fox: { ...this._fox }, drone: { ...this._dronePose } };
  }

  private _startEvent(event: GameEvent, from: IPoses): void {
    switch (event.t) {
      case 'turn': {
        const pose = event.who === 'drone' ? from.drone : from.fox;
        if (event.a !== pose.angle) {
          this._audio.turn();
        }
        return;
      }
      case 'launch':
        this._dronePose = { x: event.x, y: event.y, angle: event.a };
        this._battery = event.battery;
        this._batteryFull = event.battery || 1;
        this._drone?.removeAttribute('hidden');
        return;
      case 'zap':
        this.node
          .querySelector(`[data-fuse="${event.i}"]`)
          ?.classList.add('fsc-zapped');
        event.hazards.forEach(index => this._zapped.add(index));
        this._audio.bump();
        return;
      case 'hack': {
        const terminal = this.node.querySelector(`[data-terminal="${event.i}"]`);
        if (event.ok) {
          terminal?.classList.add('fsc-hacked');
          const color = this._scene?.terminals[event.i]?.color;
          if (color) {
            this._openDoors(color);
          }
          this._audio.chip();
        } else {
          terminal?.classList.add('fsc-denied');
        }
        return;
      }
    }
  }

  private _applyEvent(event: GameEvent, from: IPoses, progress: number): void {
    if (event.t === 'wait' || event.t === 'launch' || event.t === 'zap' || event.t === 'hack') {
      this._setWalking(false);
      return;
    }
    const drone = event.who === 'drone';
    const start = drone ? from.drone : from.fox;
    const pose = drone ? this._dronePose : this._fox;
    if (event.t === 'turn') {
      const duration = this._duration(event);
      const change = event.a - start.angle;
      const time = Math.min((Math.abs(change) / TURN_SPEED) * 1000, duration);
      const amount = time ? Math.min(1, (progress * duration) / time) : 1;
      pose.angle = start.angle + change * amount;
      this._setWalking(false);
      return;
    }
    const walkShare = event.s ? Math.min(1, event.walk / event.s) : 1;
    const walked = walkShare ? Math.min(1, progress / walkShare) : 1;
    const nextX = start.x + (event.x - start.x) * walked;
    const nextY = start.y + (event.y - start.y) * walked;
    if (drone) {
      const used = this._battery - (event.battery ?? this._battery);
      this._dronePose.x = nextX;
      this._dronePose.y = nextY;
      this._drawBattery(this._battery - used * walked);
    } else {
      this._footstepTravel += Math.hypot(nextX - this._fox.x, nextY - this._fox.y);
      if (this._footstepTravel >= FOOTSTEP_DISTANCE) {
        this._footstepTravel = 0;
        this._audio.footstep();
      }
      this._fox.x = nextX;
      this._fox.y = nextY;
      this._setWalking(walked < 1 && event.d > 0);
    }
    if (event.blocked && walked >= 1) {
      this._bump();
    }
    const reached = walked * event.d;
    for (const pick of event.picked) {
      if (reached >= pick.at) {
        this._takeChip(pick.i);
      }
    }
    for (const pick of event.keys ?? []) {
      if (reached >= pick.at) {
        this._takeKey(pick.i);
      }
    }
    if (event.intel !== undefined && reached >= event.intel) {
      this._takeIntel();
    }
  }

  private _finishEvent(event: GameEvent): void {
    if (event.t === 'turn') {
      (event.who === 'drone' ? this._dronePose : this._fox).angle = event.a;
      return;
    }
    if (event.t !== 'move') {
      return;
    }
    if (event.who === 'drone') {
      this._dronePose.x = event.x;
      this._dronePose.y = event.y;
      this._battery = event.battery ?? this._battery;
      this._drawBattery(this._battery);
      return;
    }
    this._fox.x = event.x;
    this._fox.y = event.y;
    event.picked.forEach(pick => this._takeChip(pick.i));
    (event.keys ?? []).forEach(pick => this._takeKey(pick.i));
    if (event.intel !== undefined) {
      this._takeIntel();
    }
  }

  private _takeChip(index: number): void {
    const chip = this.node.querySelector(`[data-chip="${index}"]`);
    if (!chip || chip.classList.contains('fsc-chip-taken')) {
      return;
    }
    chip.classList.add('fsc-chip-taken');
    this._hideCard();
    if (!this._scene?.chips[index].trapped) {
      this._collected++;
      this._reportChips();
      this._audio.chip();
    }
  }

  private _takeKey(index: number): void {
    const key = this.node.querySelector(`[data-key="${index}"]`);
    if (!key || key.classList.contains('fsc-taken')) {
      return;
    }
    key.classList.add('fsc-taken');
    this._hideCard();
    this._audio.chip();
    const color = this._scene?.keys[index]?.color;
    if (color) {
      this._openDoors(color);
    }
  }

  private _takeIntel(): void {
    const intel = this.node.querySelector('[data-intel]');
    if (!intel || intel.classList.contains('fsc-taken')) {
      return;
    }
    intel.classList.add('fsc-taken');
    this._hideCard();
    this._audio.chip();
  }

  private _openDoors(color: string): void {
    this._openColors.add(color);
    this._scene?.doors.forEach((door, index) => {
      if (door.color === color) {
        this.node
          .querySelector(`[data-door="${index}"]`)
          ?.classList.add('fsc-open');
      }
    });
  }

  private _showCard(target: Element | null): void {
    const holder = this.card.parentElement;
    if (!target || !holder) {
      this._hideCard();
      return;
    }
    this.card.textContent = '';
    const name = document.createElement('strong');
    name.textContent = target.getAttribute('data-card') ?? '';
    this.card.appendChild(name);
    for (const line of (target.getAttribute('data-card-lines') ?? '').split('|')) {
      if (!line) {
        continue;
      }
      const row = document.createElement('span');
      if (line.startsWith('!')) {
        row.className = 'fsc-chip-card-trap';
        row.textContent = line.slice(1);
      } else {
        row.textContent = line;
      }
      this.card.appendChild(row);
    }
    this.card.hidden = false;

    const area = holder.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const width = this.card.offsetWidth;
    const height = this.card.offsetHeight;
    const above = box.top - area.top - height - CARD_GAP;
    const left = box.left - area.left + box.width / 2 - width / 2;
    this.card.style.left = `${Math.max(0, Math.min(left, area.width - width))}px`;
    this.card.style.top = `${
      above >= 0 ? above : box.bottom - area.top + CARD_GAP
    }px`;
  }

  private _hideCard(): void {
    this.card.hidden = true;
  }

  private _reportChips(): void {
    const total = this._scene?.chips.filter(chip => !chip.trapped).length ?? 0;
    this._onChips(this._collected, total);
  }

  private _bump(): void {
    if (this.node.classList.contains('fsc-bump')) {
      return;
    }
    this.node.classList.add('fsc-bump');
    this._audio.bump();
    this._bumpTimer = window.setTimeout(() => {
      this.node.classList.remove('fsc-bump');
    }, BUMP_TIME);
  }

  private _setWalking(walking: boolean): void {
    this.node.classList.toggle('fsc-walking', walking);
  }

  private _drawActorMarkup(): void {
    if (!this._actor) {
      return;
    }
    this.node.setAttribute(
      'aria-label',
      'A night-time facility where Grep Fox collects data chips'
    );
    this._actor.innerHTML = FOX_MARKUP;
    this._heading = this._actor.querySelector('.fsc-heading') as SVGGElement;
    this._sprite = this._actor.querySelector('.fsc-sprite') as SVGGElement;
  }

  private _drawPose(): void {
    if (this._drone) {
      this._drone.setAttribute(
        'transform',
        `translate(${this._dronePose.x.toFixed(1)} ${this._dronePose.y.toFixed(1)})`
      );
      this._drone
        .querySelector('.fsc-drone-heading')
        ?.setAttribute('transform', `rotate(${this._dronePose.angle.toFixed(1)})`);
    }
    if (!this._actor || !this._heading || !this._sprite) {
      return;
    }
    this._actor.setAttribute(
      'transform',
      `translate(${this._fox.x.toFixed(1)} ${this._fox.y.toFixed(1)})`
    );
    this._heading.setAttribute('transform', `rotate(${this._fox.angle.toFixed(1)})`);
    const cosine = Math.cos((this._fox.angle * Math.PI) / 180);
    if (Math.abs(cosine) > 0.01) {
      this._facing = cosine < 0 ? -1 : 1;
    }
    this._sprite.setAttribute('transform', `scale(${this._facing} 1)`);
  }

  private _drawBattery(level: number): void {
    this._drone
      ?.querySelector('.fsc-drone-charge')
      ?.setAttribute(
        'width',
        Math.max(0, (30 * level) / this._batteryFull).toFixed(1)
      );
  }

  private _drawTimed(time: number): void {
    const scene = this._scene;
    if (!scene) {
      return;
    }
    scene.hazards.forEach((hazard, index) => {
      const active =
        !this._zapped.has(index) && (isCircle(hazard) || laserOn(hazard, time));
      this.node
        .querySelector(`[data-hazard="${index}"]`)
        ?.classList.toggle('fsc-off', !active);
    });
    const walls: IRect[] = [
      ...scene.obstacles,
      ...scene.doors.filter(door => !this._openColors.has(door.color))
    ];
    this._guardNodes.forEach((node, index) => {
      const guard = scene.guards[index];
      const pose = guardPose(guard, time);
      node
        .querySelector('.fsc-guard-cone')
        ?.setAttribute('d', visionCone(guard, pose, walls));
      node
        .querySelector('.fsc-guard-body')
        ?.setAttribute(
          'transform',
          `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)})`
        );
      node
        .querySelector('.fsc-guard-lamp')
        ?.setAttribute('transform', `rotate(${pose.angle.toFixed(1)})`);
      const cosine = Math.cos((pose.angle * Math.PI) / 180);
      if (Math.abs(cosine) > 0.01) {
        this._guardFacing[index] = cosine < 0 ? -1 : 1;
      }
      node
        .querySelector('.fsc-guard-sprite')
        ?.setAttribute('transform', `scale(${this._guardFacing[index]} 1)`);
    });
  }

  private _id: string;
  private _onChips: (collected: number, total: number) => void;
  private _audio: GameAudio;
  private _footstepTravel = 0;
  private _scene: IScene | null = null;
  private _actor: SVGGElement | null = null;
  private _drone: SVGGElement | null = null;
  private _heading: SVGGElement | null = null;
  private _sprite: SVGGElement | null = null;
  private _guardNodes: Element[] = [];
  private _guardFacing: number[] = [];
  private _fox: IPose = { x: 0, y: 0, angle: 0 };
  private _dronePose: IPose = { x: 0, y: 0, angle: 0 };
  private _battery = 0;
  private _batteryFull = 1;
  private _openColors = new Set<string>();
  private _zapped = new Set<number>();
  private _facing = 1;
  private _collected = 0;
  private _frame = 0;
  private _bumpTimer = 0;
  private _finishPlay: (() => void) | null = null;
}
