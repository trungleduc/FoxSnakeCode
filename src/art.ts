import { LabIcon } from '@jupyterlab/ui-components';
import {
  ICircle,
  IGuard,
  IGuardPose,
  IRect,
  IScene,
  isCircle,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './format';

export const fscIcon = new LabIcon({
  name: 'foxsnakecode:file',
  svgstr: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="#d9692b" d="M1 1l4 3h6l4-3-1 8-6 6-6-6z"/><path fill="#fff4e3" d="M3.4 9.4L8 13.5l4.6-4.1L9 10.2 8 12l-1-1.8z"/><circle cx="5.4" cy="7" r="1" fill="#14222f"/><circle cx="10.6" cy="7" r="1" fill="#14222f"/></svg>`
});

const CONE_RAYS = 24;

function defs(id: string): string {
  return `
  <defs>
    <pattern id="${id}-floor" width="200" height="200" patternUnits="userSpaceOnUse">
      <rect width="200" height="200" fill="#12202e"/>
      <rect width="100" height="100" fill="#152536"/>
      <rect x="100" y="100" width="100" height="100" fill="#152536"/>
      <path d="M100 0V200M0 100H200M0 0H200M0 0V200" stroke="#2a4257" stroke-width="1.5" fill="none"/>
      <g fill="#35506a">
        <circle cx="6" cy="6" r="1.6"/><circle cx="94" cy="6" r="1.6"/><circle cx="6" cy="94" r="1.6"/><circle cx="94" cy="94" r="1.6"/>
        <circle cx="106" cy="6" r="1.6"/><circle cx="194" cy="6" r="1.6"/><circle cx="106" cy="94" r="1.6"/><circle cx="194" cy="94" r="1.6"/>
        <circle cx="6" cy="106" r="1.6"/><circle cx="94" cy="106" r="1.6"/><circle cx="6" cy="194" r="1.6"/><circle cx="94" cy="194" r="1.6"/>
        <circle cx="106" cy="106" r="1.6"/><circle cx="194" cy="106" r="1.6"/><circle cx="106" cy="194" r="1.6"/><circle cx="194" cy="194" r="1.6"/>
      </g>
    </pattern>
    <pattern id="${id}-crate" width="50" height="50" patternUnits="userSpaceOnUse">
      <rect width="50" height="50" fill="#51657a"/>
      <rect x="4" y="4" width="42" height="42" rx="2" fill="#3d4f62" stroke="#71889e" stroke-width="2"/>
      <path d="M6 6L44 44M44 6L6 44" stroke="#71889e" stroke-width="4"/>
      <path d="M0 0H50M0 0V50" stroke="#27343f" stroke-width="2"/>
    </pattern>
    <pattern id="${id}-stripes" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="24" height="24" fill="#1a1f26"/>
      <rect width="12" height="24" fill="#c49a2c"/>
    </pattern>
    <radialGradient id="${id}-moon" cx="0.72" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#4c8bb0" stop-opacity="0.26"/>
      <stop offset="0.55" stop-color="#1e4966" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-vignette" cx="0.5" cy="0.5" r="0.74">
      <stop offset="0.62" stop-color="#040a12" stop-opacity="0"/>
      <stop offset="1" stop-color="#040a12" stop-opacity="0.62"/>
    </radialGradient>
    <radialGradient id="${id}-light">
      <stop offset="0" stop-color="#fffbe0"/>
      <stop offset="0.7" stop-color="#ffec93"/>
      <stop offset="1" stop-color="#ffd84a"/>
    </radialGradient>
    <linearGradient id="${id}-beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff2ad" stop-opacity="0.03"/>
      <stop offset="1" stop-color="#fff2ad" stop-opacity="0.24"/>
    </linearGradient>
    <radialGradient id="${id}-glow">
      <stop offset="0" stop-color="#37f5d6" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#37f5d6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-glow-trap">
      <stop offset="0" stop-color="#ff4d5e" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ff4d5e" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

function floorMarks(): string {
  let labels = '';
  for (let x = 100; x < WORLD_WIDTH; x += 100) {
    labels += `<text x="${x}" y="${WORLD_HEIGHT - 16}" text-anchor="middle">${x}</text>`;
  }
  for (let y = 100; y < WORLD_HEIGHT; y += 100) {
    labels += `<text x="13" y="${y + 3}">${y}</text>`;
  }
  return `<g class="fsc-ruler">${labels}</g>`;
}

function crate(rect: IRect, id: string): string {
  return `
  <g class="fsc-crate">
    <rect x="${rect.x + 5}" y="${rect.y + 8}" width="${rect.w}" height="${rect.h}" rx="4" fill="#02060c" opacity="0.5"/>
    <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="3" fill="url(#${id}-crate)" stroke="#19232d" stroke-width="2.5"/>
    <path d="M${rect.x + 3} ${rect.y + 2.5}H${rect.x + rect.w - 3}" stroke="#a8bfd3" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  </g>`;
}

function searchlight(light: ICircle, id: string): string {
  const topX = light.x + 150;
  return `
  <g class="fsc-light">
    <path d="M${topX - 8} -10L${topX + 8} -10L${light.x + light.r} ${light.y}L${light.x - light.r} ${light.y}Z" fill="url(#${id}-beam)"/>
    <circle cx="${light.x}" cy="${light.y}" r="${light.r + 12}" fill="#ffe680" opacity="0.2"/>
    <circle cx="${light.x}" cy="${light.y}" r="${light.r}" fill="url(#${id}-light)" stroke="#fffbe0" stroke-width="2"/>
  </g>`;
}

function laser(rect: IRect): string {
  const horizontal = rect.w >= rect.h;
  const emitters = horizontal
    ? [
        [rect.x - 6, rect.y + rect.h / 2 - 8, 12, 16],
        [rect.x + rect.w - 6, rect.y + rect.h / 2 - 8, 12, 16]
      ]
    : [
        [rect.x + rect.w / 2 - 8, rect.y - 6, 16, 12],
        [rect.x + rect.w / 2 - 8, rect.y + rect.h - 6, 16, 12]
      ];
  const pad = 6;
  return `
  <g class="fsc-laser">
    <rect x="${rect.x - (horizontal ? 0 : pad)}" y="${rect.y - (horizontal ? pad : 0)}" width="${rect.w + (horizontal ? 0 : pad * 2)}" height="${rect.h + (horizontal ? pad * 2 : 0)}" fill="#ff2d48" opacity="0.28"/>
    <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#ff5a6e"/>
    ${emitters
      .map(
        ([x, y, w, h]) =>
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#2b3a48" stroke="#7d93a6" stroke-width="1.5"/>`
      )
      .join('')}
  </g>`;
}

function chip(x: number, y: number, trapped: boolean, index: number, id: string): string {
  const body = trapped ? '#5a1620' : '#0f4a4a';
  const edge = trapped ? '#ff5a6e' : '#37f5d6';
  const core = trapped
    ? `<path d="M-5 -5L5 5M5 -5L-5 5" stroke="#ffd3d8" stroke-width="3" stroke-linecap="round"/>`
    : `<rect x="-4.5" y="-4.5" width="9" height="9" rx="1.5" fill="#37f5d6"/>`;
  const pins = [-7, 0, 7]
    .map(
      p =>
        `<path d="M${p} -15V-11M${p} 11V15M-15 ${p}H-11M11 ${p}H15" stroke="${edge}" stroke-width="2" stroke-linecap="round"/>`
    )
    .join('');
  return `
  <g class="fsc-chip" data-chip="${index}" transform="translate(${x} ${y})">
    <g class="fsc-chip-inner">
      <circle r="28" fill="url(#${id}-glow${trapped ? '-trap' : ''})"/>
      ${pins}
      <rect x="-11" y="-11" width="22" height="22" rx="3" fill="${body}" stroke="${edge}" stroke-width="2"/>
      ${core}
    </g>
  </g>`;
}

function guardRoute(guard: IGuard): string {
  const points = guard.route.map(point => `${point.x} ${point.y}`).join('L');
  return `<path class="fsc-guard-route" d="M${points}Z"/>`;
}

function guardMarkup(index: number): string {
  return `
  <g class="fsc-guard" data-guard="${index}">
    <path class="fsc-guard-cone"/>
    <g class="fsc-guard-body">
      <ellipse cx="0" cy="21" rx="20" ry="5" fill="#02060c" opacity="0.5"/>
      <g class="fsc-guard-sprite">
        <g class="fsc-guard-bounce">
          <path d="M-14 8L-22 14M-15 13L-21 20M-9 16L-13 22M14 8L22 14M15 13L21 20M9 16L13 22" fill="none" stroke="#2A2F36" stroke-width="3.2" stroke-linecap="round"/>
          <path d="M-5 -17Q-9 -27 -15 -28M5 -17Q9 -27 15 -28" fill="none" stroke="#0F2E33" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="-16" cy="-28.5" r="3" fill="#FFC93C" stroke="#0F2E33" stroke-width="1.2"/>
          <circle cx="16" cy="-28.5" r="3" fill="#FFC93C" stroke="#0F2E33" stroke-width="1.2"/>
          <ellipse cx="0" cy="4" rx="19" ry="16" fill="#C8404F" stroke="#0F2E33" stroke-width="1.6"/>
          <path d="M0 -11V20" stroke="#0F2E33" stroke-width="1.6"/>
          <g fill="#7A1F2B"><circle cx="-9" cy="4" r="3"/><circle cx="9" cy="4" r="3"/><circle cx="-7" cy="13" r="2.2"/><circle cx="7" cy="13" r="2.2"/></g>
          <path d="M-14 -7C-14 -21 14 -21 14 -7C14 -3 -14 -3 -14 -7Z" fill="#3D4A6B" stroke="#0F2E33" stroke-width="1.6" stroke-linejoin="round"/>
          <circle cx="4" cy="-10" r="6.2" fill="#FFFFFF" stroke="#0F2E33" stroke-width="1.4"/>
          <circle cx="6" cy="-10" r="3" fill="#14181F"/>
          <circle cx="7" cy="-11.2" r="1" fill="#FFFFFF"/>
          <path d="M-9 -9H-4" stroke="#7E93A3" stroke-width="2" stroke-linecap="round"/>
        </g>
      </g>
      <g class="fsc-guard-lamp">
        <rect x="16" y="-5" width="11" height="10" rx="2" fill="#2A2F36" stroke="#7E93A3" stroke-width="1"/>
        <rect x="25" y="-6.5" width="4" height="13" rx="1.5" fill="#FFE680"/>
      </g>
    </g>
  </g>`;
}

function rayLength(
  pose: IGuardPose,
  angle: number,
  range: number,
  obstacles: IRect[]
): number {
  const radians = (angle * Math.PI) / 180;
  const axes = (rect: IRect): number[][] => [
    [pose.x, Math.cos(radians), rect.x, rect.x + rect.w],
    [pose.y, Math.sin(radians), rect.y, rect.y + rect.h]
  ];
  let nearest = range;
  for (const obstacle of obstacles) {
    let near = 0;
    let far = nearest;
    for (const [origin, direction, low, high] of axes(obstacle)) {
      if (Math.abs(direction) < 1e-9) {
        if (origin < low || origin > high) {
          far = -1;
        }
        continue;
      }
      const first = (low - origin) / direction;
      const second = (high - origin) / direction;
      near = Math.max(near, Math.min(first, second));
      far = Math.min(far, Math.max(first, second));
    }
    if (near <= far) {
      nearest = near;
    }
  }
  return nearest;
}

export function visionCone(
  guard: IGuard,
  pose: IGuardPose,
  obstacles: IRect[]
): string {
  let path = `M${pose.x.toFixed(1)} ${pose.y.toFixed(1)}`;
  for (let ray = 0; ray <= CONE_RAYS; ray++) {
    const angle = pose.angle - guard.fov / 2 + (guard.fov * ray) / CONE_RAYS;
    const length = rayLength(pose, angle, guard.sight, obstacles);
    const radians = (angle * Math.PI) / 180;
    const x = pose.x + Math.cos(radians) * length;
    const y = pose.y + Math.sin(radians) * length;
    path += `L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${path}Z`;
}

export function sceneMarkup(scene: IScene, id: string): string {
  const hazards = scene.hazards
    .map(hazard =>
      isCircle(hazard) ? searchlight(hazard, id) : laser(hazard)
    )
    .join('');
  return `
  ${defs(id)}
  <rect width="${WORLD_WIDTH}" height="${WORLD_HEIGHT}" fill="url(#${id}-floor)"/>
  <rect width="${WORLD_WIDTH}" height="${WORLD_HEIGHT}" fill="url(#${id}-moon)"/>
  ${floorMarks()}
  <g fill="url(#${id}-stripes)">
    <rect width="${WORLD_WIDTH}" height="5"/>
    <rect y="${WORLD_HEIGHT - 5}" width="${WORLD_WIDTH}" height="5"/>
    <rect width="5" height="${WORLD_HEIGHT}"/>
    <rect x="${WORLD_WIDTH - 5}" width="5" height="${WORLD_HEIGHT}"/>
  </g>
  <circle class="fsc-start" cx="${scene.start.x}" cy="${scene.start.y}" r="24"/>
  ${scene.guards.map(guardRoute).join('')}
  ${hazards}
  ${scene.obstacles.map(obstacle => crate(obstacle, id)).join('')}
  ${scene.chips.map((c, index) => chip(c.x, c.y, !!c.trapped, index, id)).join('')}
  ${scene.guards.map((_, index) => guardMarkup(index)).join('')}
  <g class="fsc-actor"></g>
  <rect width="${WORLD_WIDTH}" height="${WORLD_HEIGHT}" fill="url(#${id}-vignette)" pointer-events="none"/>`;
}

const HEADING = `
  <g class="fsc-heading">
    <path d="M34 -7L44 0L34 7" fill="none" stroke="#f7f3d0" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

export const FOX_MARKUP = `
  <ellipse cx="0" cy="25" rx="24" ry="6" fill="#02060c" opacity="0.5"/>
  ${HEADING}
  <g class="fsc-sprite">
    <g class="fsc-bounce">
      <g class="fsc-tail">
        <path d="M-8 14C-24 16 -32 4 -27 -10C-25 -16 -19 -18 -17 -12C-15 -4 -18 4 -8 8Z" fill="#E8894A" stroke="#0F2E33" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M-27 -10C-25 -16 -19 -18 -17 -12C-16.5 -9 -17 -7 -17.5 -5C-20 -8 -24 -9 -27 -10Z" fill="#F4F1EA"/>
      </g>
      <g class="fsc-leg fsc-leg-a"><rect x="-8" y="14" width="7" height="11" rx="2.5" fill="#2A2F36" stroke="#7E93A3" stroke-width="1"/></g>
      <g class="fsc-leg fsc-leg-b"><rect x="1" y="14" width="7" height="11" rx="2.5" fill="#2A2F36" stroke="#7E93A3" stroke-width="1"/></g>
      <path d="M-10 4L-15 11" stroke="#7E93A3" stroke-width="6.4" stroke-linecap="round"/>
      <path d="M-10 4L-15 11" stroke="#3E4636" stroke-width="4.6" stroke-linecap="round"/>
      <circle cx="-15.5" cy="12" r="2.8" fill="#2A2F36" stroke="#7E93A3" stroke-width="1"/>
      <rect x="-11" y="0" width="22" height="17" rx="7" fill="#3E4636" stroke="#7E93A3" stroke-width="1"/>
      <g fill="#52604A" stroke="#1E2329" stroke-width="0.8">
        <rect x="-9" y="6" width="5.5" height="5.5" rx="1"/>
        <rect x="-2.75" y="6" width="5.5" height="5.5" rx="1"/>
        <rect x="3.5" y="6" width="5.5" height="5.5" rx="1"/>
      </g>
      <rect x="-3" y="1.6" width="6" height="3" rx="0.8" fill="#FFC93C"/>
      <rect x="-10.6" y="12.6" width="21.2" height="2.6" fill="#1E2329"/>
      <rect x="-1.3" y="12.6" width="2.6" height="2.6" fill="#FFC93C"/>
      <path d="M10 4L16 9" stroke="#7E93A3" stroke-width="6.4" stroke-linecap="round"/>
      <path d="M10 4L16 9" stroke="#3E4636" stroke-width="4.6" stroke-linecap="round"/>
      <circle cx="16.5" cy="9.5" r="2.8" fill="#2A2F36" stroke="#7E93A3" stroke-width="1"/>
      <g class="fsc-fox-head" transform="translate(0 -14)">
        <path d="M-18 -11L-20 -29L-5 -18Z" fill="#E8894A" stroke="#0F2E33" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M-16 -14L-17.5 -24.5L-9 -18Z" fill="#3B2A22"/>
        <path d="M18 -11L20 -29L5 -18Z" fill="#E8894A" stroke="#0F2E33" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M16 -14L17.5 -24.5L9 -18Z" fill="#3B2A22"/>
        <path d="M-21 -6C-21 -16 -11 -19 0 -19C11 -19 21 -16 21 -6L24 1L19 3C15 10 7 14 0 14C-7 14 -15 10 -19 3L-24 1Z" fill="#E8894A" stroke="#0F2E33" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M-19 2.4C-13 -1 -6 1 0 1C6 1 13 -1 19 2.4C15 10 7 13.2 0 13.2C-7 13.2 -15 10 -19 2.4Z" fill="#F4F1EA"/>
        <path d="M-20 -11C-20 -24 -10 -27 0 -27C10 -27 20 -24 20 -11Z" fill="#2A2F36" stroke="#7E93A3" stroke-width="1"/>
        <path d="M-15 -19C-12 -23 -8 -24.5 -4 -25" fill="none" stroke="#7E93A3" stroke-width="1.2" stroke-linecap="round"/>
        <rect x="-6.5" y="-21" width="13" height="6.4" rx="1.2" fill="#3E4636"/>
        <rect x="-3.8" y="-18.8" width="7.6" height="2" rx="0.8" fill="#FFC93C"/>
        <rect x="-22" y="-12" width="44" height="5" rx="1.5" fill="#1E2329" stroke="#7E93A3" stroke-width="1"/>
        <path d="M-13 -4.6L-6 -3M13 -4.6L6 -3" stroke="#0F2E33" stroke-width="1.6" stroke-linecap="round"/>
        <g class="fsc-eyes fsc-eyes-open">
          <ellipse class="fsc-blink" cx="-7" cy="1.4" rx="4" ry="4.7" fill="#14181F"/>
          <ellipse class="fsc-blink" cx="7" cy="1.4" rx="4" ry="4.7" fill="#14181F"/>
          <circle cx="-5.7" cy="-0.4" r="1.4" fill="#FFFFFF"/><circle cx="8.3" cy="-0.4" r="1.4" fill="#FFFFFF"/>
          <circle cx="-8.5" cy="3.4" r="0.6" fill="#FFFFFF"/><circle cx="5.5" cy="3.4" r="0.6" fill="#FFFFFF"/>
        </g>
        <g class="fsc-eyes fsc-eyes-happy">
          <path d="M-11 2.5Q-7 -3 -3 2.5M3 2.5Q7 -3 11 2.5" fill="none" stroke="#14181F" stroke-width="1.9" stroke-linecap="round"/>
        </g>
        <g class="fsc-eyes fsc-eyes-dizzy">
          <path d="M-10 -1.6L-4 4.4M-4 -1.6L-10 4.4M4 -1.6L10 4.4M10 -1.6L4 4.4" stroke="#14181F" stroke-width="1.9" stroke-linecap="round"/>
        </g>
        <ellipse cx="-12.5" cy="7" rx="2.6" ry="1.6" fill="#FFB3C1"/>
        <ellipse cx="12.5" cy="7" rx="2.6" ry="1.6" fill="#FFB3C1"/>
        <path d="M-1.7 5.6Q0 4.7 1.7 5.6Q1 7.6 0 7.8Q-1 7.6 -1.7 5.6Z" fill="#14181F"/>
        <path d="M0 7.8V8.8M-2.6 8.8C-1.6 10.4 -0.5 9.9 0 8.8C0.5 9.9 1.6 10.4 2.6 8.8" fill="none" stroke="#14181F" stroke-width="0.9" stroke-linecap="round"/>
        <path d="M-21 -3Q-21 7 -13 10" fill="none" stroke="#0F2E33" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="-12.5" cy="10.2" r="1.5" fill="#0F2E33"/>
        <rect x="-25.5" y="-13.5" width="7" height="11" rx="3" fill="#3E4636" stroke="#7E93A3" stroke-width="1"/>
      </g>
    </g>
  </g>`;

function toolIcon(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export const TOOL_ICONS = {
  step: toolIcon(
    '<g fill="currentColor" stroke="none"><ellipse cx="12" cy="16.5" rx="5" ry="4"/><circle cx="5.5" cy="11" r="2.2"/><circle cx="9.5" cy="6.5" r="2.2"/><circle cx="14.5" cy="6.5" r="2.2"/><circle cx="18.5" cy="11" r="2.2"/></g>'
  ),
  left: toolIcon('<path d="M9 9l-5 5 5 5"/><path d="M4 14h9a6 6 0 0 0 6-6V5"/>'),
  right: toolIcon('<path d="M15 9l5 5-5 5"/><path d="M20 14h-9a6 6 0 0 1-6-6V5"/>'),
  face: toolIcon(
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'
  ),
  wait: toolIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>'),
  more: toolIcon('<path d="M12 5v14M5 12h14"/>'),
  send: toolIcon('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'),
  close: toolIcon('<path d="M6 6l12 12M18 6L6 18"/>')
};

export const LOCK_BADGE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';

export const BOSS_BADGE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19 5 7l5 5 2-8 2 8 5-5 2 12z" fill="currentColor"/></svg>';

export function sudoSnakeAvatar(id: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="140 40 320 320">
<defs>
<clipPath id="${id}"><circle cx="300" cy="200" r="158"></circle></clipPath>
</defs>
<circle cx="300" cy="200" r="158" fill="#FFC93C"></circle>
<g clip-path="url(#${id})">
<path d="M 380 505 C 470 470 450 360 360 340 C 280 320 260 280 300 250" fill="none" stroke="#0F2E33" stroke-width="82" stroke-linecap="round"></path>
<path d="M 380 505 C 470 470 450 360 360 340 C 280 320 260 280 300 250" fill="none" stroke="#34C58F" stroke-width="66" stroke-linecap="round"></path>
<path d="M 380 505 C 470 470 450 360 360 340" fill="none" stroke="#C9F5DC" stroke-width="22" stroke-linecap="round"></path>
<path d="M 360 340 C 280 320 260 280 300 250" fill="none" stroke="#0F2E33" stroke-width="96" stroke-linecap="round"></path>
<path d="M 360 340 C 280 320 260 280 300 250" fill="none" stroke="#3D4A6B" stroke-width="82" stroke-linecap="round"></path>
<rect x="352" y="290" width="20" height="100" rx="10" fill="#3D4A6B" stroke="#0F2E33" stroke-width="5" transform="rotate(14 362 340)"></rect>
<rect x="352" y="290" width="20" height="100" rx="10" fill="#FFFFFF" opacity="0.14" transform="rotate(14 362 340)"></rect>
<ellipse cx="300" cy="178" rx="132" ry="118" fill="#3D4A6B" stroke="#0F2E33" stroke-width="6"></ellipse>
<ellipse cx="300" cy="188" rx="112" ry="96" fill="#141A26"></ellipse>
<circle cx="311" cy="322" r="19" fill="#FFFFFF" stroke="#0F2E33" stroke-width="5"></circle>
<text x="311" y="331" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="24" font-weight="500" fill="#0F2E33">#</text>
<ellipse cx="300" cy="202" rx="100" ry="78" fill="#34C58F" stroke="#0F2E33" stroke-width="6"></ellipse>
<circle cx="276" cy="140" r="8" fill="#0F2E33" opacity="0.16"></circle>
<circle cx="322" cy="137" r="6" fill="#0F2E33" opacity="0.16"></circle>
<circle cx="300" cy="131" r="4" fill="#0F2E33" opacity="0.16"></circle>
<path d="M 205 222 Q 212 268 258 266" fill="none" stroke="#0F2E33" stroke-width="6" stroke-linecap="round"></path>
<circle cx="263" cy="266" r="8" fill="#0F2E33"></circle>
<circle cx="200" cy="205" r="17" fill="#FFC93C" stroke="#0F2E33" stroke-width="5"></circle>
<ellipse cx="262" cy="192" rx="25" ry="29" fill="#FFFFFF" stroke="#0F2E33" stroke-width="4"></ellipse>
<ellipse cx="338" cy="192" rx="25" ry="29" fill="#FFFFFF" stroke="#0F2E33" stroke-width="4"></ellipse>
<circle cx="269" cy="197" r="13" fill="#0F2E33"></circle>
<circle cx="345" cy="197" r="13" fill="#0F2E33"></circle>
<circle cx="274" cy="190" r="5" fill="#FFFFFF"></circle>
<circle cx="350" cy="190" r="5" fill="#FFFFFF"></circle>
<path d="M 236 152 Q 260 146 286 160" fill="none" stroke="#0F2E33" stroke-width="7" stroke-linecap="round"></path>
<path d="M 364 152 Q 340 146 314 160" fill="none" stroke="#0F2E33" stroke-width="7" stroke-linecap="round"></path>
<ellipse cx="232" cy="232" rx="13" ry="8" fill="#FF8FA3" opacity="0.6"></ellipse>
<ellipse cx="368" cy="232" rx="13" ry="8" fill="#FF8FA3" opacity="0.6"></ellipse>
<circle cx="292" cy="226" r="2.5" fill="#0F2E33"></circle>
<circle cx="308" cy="226" r="2.5" fill="#0F2E33"></circle>
<path d="M 280 240 Q 302 256 326 238" fill="none" stroke="#0F2E33" stroke-width="5" stroke-linecap="round"></path>
<path d="M 306 249 L 309 266 L 302 274 M 309 266 L 316 274" fill="none" stroke="#E5484D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
</g>
<circle cx="300" cy="200" r="158" fill="none" stroke="#0F2E33" stroke-width="6"></circle>
</svg>`;
}
