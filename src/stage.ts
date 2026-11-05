import { FOX_MARKUP, sceneMarkup, visionCone } from './art';
import { GameAudio } from './audio';
import { GameEvent } from './engine';
import { guardPose, IScene, WORLD_HEIGHT, WORLD_WIDTH } from './format';

const TURN_SPEED = 360;
const BUMP_TIME = 260;
const MAX_PLAY_TIME = 30000;
const FOOTSTEP_DISTANCE = 45;

const SVG_NS = 'http://www.w3.org/2000/svg';

let nextStageId = 0;

export class Stage {
  readonly node: SVGSVGElement;

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
  }

  load(scene: IScene): void {
    this.stop();
    this._scene = scene;
    this.node.innerHTML = sceneMarkup(scene, this._id);
    this._actor = this.node.querySelector('.fsc-actor') as SVGGElement;
    this._guardNodes = Array.from(this.node.querySelectorAll('.fsc-guard'));
    this._guardFacing = this._guardNodes.map(() => 1);
    this.reset();
  }

  reset(): void {
    this.stop();
    const scene = this._scene;
    if (!scene) {
      return;
    }
    this._x = scene.start.x;
    this._y = scene.start.y;
    this._angle = scene.start.angle;
    this._collected = 0;
    this._facing = Math.cos((this._angle * Math.PI) / 180) < -0.01 ? -1 : 1;
    this.setOutcome(null);
    this.node
      .querySelectorAll('.fsc-chip-taken')
      .forEach(chip => chip.classList.remove('fsc-chip-taken'));
    this._drawActorMarkup();
    this._drawPose();
    this._drawGuards(0);
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
      let from = { x: this._x, y: this._y, angle: this._angle };
      let last: number | null = null;
      let announced = -1;
      const tick = (now: number) => {
        let budget = last === null ? 0 : (now - last) * rate;
        last = now;
        while (index < events.length) {
          const event = events[index];
          if (index !== announced) {
            announced = index;
            if (event.t === 'turn' && event.a !== from.angle) {
              this._audio.turn();
            }
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
          from = { x: this._x, y: this._y, angle: this._angle };
          index++;
          finishedTime += eventTime;
          eventTime = 0;
        }
        this._drawPose();
        this._drawGuards((finishedTime + eventTime) / 1000);
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

  private _applyEvent(
    event: GameEvent,
    from: { x: number; y: number; angle: number },
    progress: number
  ): void {
    if (event.t === 'wait') {
      this._setWalking(false);
      return;
    }
    if (event.t === 'turn') {
      const duration = this._duration(event);
      const change = event.a - from.angle;
      const time = Math.min((Math.abs(change) / TURN_SPEED) * 1000, duration);
      const amount = time ? Math.min(1, (progress * duration) / time) : 1;
      this._angle = from.angle + change * amount;
      this._setWalking(false);
      return;
    }
    const walkShare = event.s ? Math.min(1, event.walk / event.s) : 1;
    const walked = walkShare ? Math.min(1, progress / walkShare) : 1;
    const nextX = from.x + (event.x - from.x) * walked;
    const nextY = from.y + (event.y - from.y) * walked;
    this._footstepTravel += Math.hypot(nextX - this._x, nextY - this._y);
    if (this._footstepTravel >= FOOTSTEP_DISTANCE) {
      this._footstepTravel = 0;
      this._audio.footstep();
    }
    this._x = nextX;
    this._y = nextY;
    this._setWalking(walked < 1 && event.d > 0);
    if (event.blocked && walked >= 1) {
      this._bump();
    }
    for (const pick of event.picked) {
      if (walked * event.d >= pick.at) {
        this._takeChip(pick.i);
      }
    }
  }

  private _finishEvent(event: GameEvent): void {
    if (event.t === 'wait') {
      return;
    }
    if (event.t === 'turn') {
      this._angle = event.a;
      return;
    }
    this._x = event.x;
    this._y = event.y;
    event.picked.forEach(pick => this._takeChip(pick.i));
  }

  private _takeChip(index: number): void {
    const chip = this.node.querySelector(`[data-chip="${index}"]`);
    if (!chip || chip.classList.contains('fsc-chip-taken')) {
      return;
    }
    chip.classList.add('fsc-chip-taken');
    if (!this._scene?.chips[index].trapped) {
      this._collected++;
      this._reportChips();
      this._audio.chip();
    }
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
    if (!this._actor || !this._heading || !this._sprite) {
      return;
    }
    this._actor.setAttribute(
      'transform',
      `translate(${this._x.toFixed(1)} ${this._y.toFixed(1)})`
    );
    this._heading.setAttribute('transform', `rotate(${this._angle.toFixed(1)})`);
    const cosine = Math.cos((this._angle * Math.PI) / 180);
    if (Math.abs(cosine) > 0.01) {
      this._facing = cosine < 0 ? -1 : 1;
    }
    this._sprite.setAttribute('transform', `scale(${this._facing} 1)`);
  }

  private _drawGuards(time: number): void {
    const scene = this._scene;
    if (!scene) {
      return;
    }
    this._guardNodes.forEach((node, index) => {
      const guard = scene.guards[index];
      const pose = guardPose(guard, time);
      node
        .querySelector('.fsc-guard-cone')
        ?.setAttribute('d', visionCone(guard, pose, scene.obstacles));
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
  private _heading: SVGGElement | null = null;
  private _sprite: SVGGElement | null = null;
  private _guardNodes: Element[] = [];
  private _guardFacing: number[] = [];
  private _x = 0;
  private _y = 0;
  private _angle = 0;
  private _facing = 1;
  private _collected = 0;
  private _frame = 0;
  private _bumpTimer = 0;
  private _finishPlay: (() => void) | null = null;
}
