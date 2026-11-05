import { LabIcon } from '@jupyterlab/ui-components';
import {
  ICircle,
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
  ${hazards}
  ${scene.obstacles.map(obstacle => crate(obstacle, id)).join('')}
  ${scene.chips.map((c, index) => chip(c.x, c.y, !!c.trapped, index, id)).join('')}
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
        <path d="M-11 9C-24 11 -38 3 -36 -14C-35 -22 -31 -27 -27 -30C-27 -21 -22 -14 -8 -3Z" fill="#d9692b" stroke="#7b3513" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M-35.5 -11C-35.5 -20 -31 -27 -27 -30C-27 -24 -25 -19 -22 -15C-27 -15 -31 -14 -35.5 -11Z" fill="#fff4e3"/>
      </g>
      <g class="fsc-leg fsc-leg-b"><rect x="-13" y="9" width="7" height="16" rx="3.5" fill="#a84d1c"/><rect x="-13" y="18" width="7" height="7" rx="3" fill="#2a2430"/></g>
      <g class="fsc-leg fsc-leg-a"><rect x="4" y="9" width="7" height="16" rx="3.5" fill="#a84d1c"/><rect x="4" y="18" width="7" height="7" rx="3" fill="#2a2430"/></g>
      <ellipse cx="-1" cy="5" rx="16" ry="13" fill="#d9692b" stroke="#7b3513" stroke-width="1.5"/>
      <ellipse cx="4" cy="10" rx="9" ry="7" fill="#fff4e3"/>
      <rect x="-17" y="-8" width="13" height="16" rx="3.5" fill="#1d3342" stroke="#0c1a24" stroke-width="1.5"/>
      <path d="M-14.5 -2.5L-13 -5.5L-11.5 -3.8H-9.5L-8 -5.5L-6.5 -2.5L-10.5 2Z" fill="#37f5d6"/>
      <g class="fsc-leg fsc-leg-a"><rect x="-8" y="10" width="7" height="15" rx="3.5" fill="#c55e24"/><rect x="-8" y="18" width="7" height="7" rx="3" fill="#2a2430"/></g>
      <g class="fsc-leg fsc-leg-b"><rect x="9" y="10" width="7" height="15" rx="3.5" fill="#c55e24"/><rect x="9" y="18" width="7" height="7" rx="3" fill="#2a2430"/></g>
      <g class="fsc-fox-head" transform="translate(9 -15)">
        <path d="M-17 -5L-15 -27L-3 -15Z" fill="#d9692b" stroke="#7b3513" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M-13.5 -11L-13 -21.5L-7 -15Z" fill="#3b2230"/>
        <path d="M17 -5L15 -27L3 -15Z" fill="#d9692b" stroke="#7b3513" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M13.5 -11L13 -21.5L7 -15Z" fill="#3b2230"/>
        <path d="M-20 -3C-20 -14 -10 -18 0 -18C10 -18 20 -14 20 -3C20 2 16 6 11 9C7 12 3 15 0 15C-3 15 -7 12 -11 9C-16 6 -20 2 -20 -3Z" fill="#e4752f" stroke="#7b3513" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M-19 0C-13 -1 -7 1 0 8C7 1 13 -1 19 0C18 3 15 6 11 9C7 12 3 15 0 15C-3 15 -7 12 -11 9C-15 6 -18 3 -19 0Z" fill="#fff4e3"/>
        <path d="M-3.5 7.5C-2 6.5 2 6.5 3.5 7.5C3 10 1 11.5 0 11.5C-1 11.5 -3 10 -3.5 7.5Z" fill="#23202a"/>
        <path d="M0 11.5V13.5M-3 14C-1.5 15 -0.5 14.5 0 13.5C0.5 14.5 1.5 15 3 14" fill="none" stroke="#23202a" stroke-width="1.2" stroke-linecap="round"/>
        <g class="fsc-eyes fsc-eyes-open">
          <ellipse class="fsc-blink" cx="-8" cy="-3" rx="3.8" ry="4.6" fill="#14222f"/>
          <ellipse class="fsc-blink" cx="8" cy="-3" rx="3.8" ry="4.6" fill="#14222f"/>
          <circle cx="-6.8" cy="-4.8" r="1.4" fill="#fff"/><circle cx="9.2" cy="-4.8" r="1.4" fill="#fff"/>
          <path d="M-13 -9.5L-4 -7.5M13 -9.5L4 -7.5" stroke="#7b3513" stroke-width="2" stroke-linecap="round"/>
        </g>
        <g class="fsc-eyes fsc-eyes-happy">
          <path d="M-12 -2C-10 -7 -6 -7 -4 -2M12 -2C10 -7 6 -7 4 -2" fill="none" stroke="#14222f" stroke-width="2.6" stroke-linecap="round"/>
        </g>
        <g class="fsc-eyes fsc-eyes-dizzy">
          <path d="M-11.5 -6L-4.5 0M-4.5 -6L-11.5 0M4.5 -6L11.5 0M11.5 -6L4.5 0" stroke="#14222f" stroke-width="2.6" stroke-linecap="round"/>
        </g>
      </g>
    </g>
  </g>`;

export const SNAKE_MARKUP = `
  <ellipse cx="0" cy="25" rx="26" ry="6" fill="#02060c" opacity="0.5"/>
  ${HEADING}
  <g class="fsc-sprite">
    <g class="fsc-bounce">
      <g class="fsc-tail">
        <path d="M-18 18C-31 21 -37 11 -29 6" fill="none" stroke="#12694F" stroke-width="9" stroke-linecap="round"/>
        <path d="M-18 18C-31 21 -37 11 -29 6" fill="none" stroke="#34C58F" stroke-width="6" stroke-linecap="round"/>
      </g>
      <g class="fsc-coil fsc-coil-a">
        <ellipse cx="-1" cy="16" rx="23" ry="9" fill="#34C58F" stroke="#12694F" stroke-width="1.5"/>
        <path d="M-18 19Q-1 27 16 19" fill="none" stroke="#C9F5DC" stroke-width="3" stroke-linecap="round"/>
      </g>
      <g class="fsc-coil fsc-coil-b">
        <ellipse cx="1" cy="7" rx="18" ry="8" fill="#34C58F" stroke="#12694F" stroke-width="1.5"/>
        <path d="M-12 10Q1 16 14 10" fill="none" stroke="#C9F5DC" stroke-width="2.5" stroke-linecap="round"/>
      </g>
      <g class="fsc-coil fsc-coil-a">
        <ellipse cx="0" cy="-1" rx="13" ry="7" fill="#34C58F" stroke="#12694F" stroke-width="1.5"/>
        <path d="M-8 2Q0 6 8 2" fill="none" stroke="#C9F5DC" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g transform="translate(6 -17)">
        <ellipse cx="-3" cy="11" rx="12" ry="6" fill="#5A6F9E" stroke="#27365C" stroke-width="1.5"/>
        <ellipse cx="0" cy="0" rx="19" ry="17" fill="#5A6F9E" stroke="#27365C" stroke-width="1.5"/>
        <ellipse cx="1" cy="1" rx="16" ry="14" fill="#1B2233"/>
        <ellipse cx="2" cy="3" rx="14" ry="11" fill="#34C58F" stroke="#12694F" stroke-width="1.2"/>
        <path d="M-17 -3C-16 -22 17 -22 18 -5" fill="none" stroke="#FFC93C" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="-17" cy="1" r="4.5" fill="#FFC93C" stroke="#8A6A12" stroke-width="1.2"/>
        <circle cx="18" cy="-2" r="3" fill="#FFC93C" stroke="#8A6A12" stroke-width="1.2"/>
        <g class="fsc-eyes fsc-eyes-open">
          <ellipse cx="-3" cy="0" rx="4.6" ry="5.4" fill="#FFFFFF" stroke="#12694F" stroke-width="0.8"/>
          <ellipse cx="8" cy="0" rx="4.6" ry="5.4" fill="#FFFFFF" stroke="#12694F" stroke-width="0.8"/>
          <circle class="fsc-blink" cx="-1.5" cy="1" r="2.6" fill="#14222F"/>
          <circle class="fsc-blink" cx="9.5" cy="1" r="2.6" fill="#14222F"/>
          <circle cx="-0.6" cy="-0.2" r="1" fill="#FFFFFF"/>
          <circle cx="10.4" cy="-0.2" r="1" fill="#FFFFFF"/>
        </g>
        <g class="fsc-eyes fsc-eyes-happy">
          <path d="M-7 2Q-3 -4 1 2M4 2Q8 -4 12 2" fill="none" stroke="#14222F" stroke-width="1.8" stroke-linecap="round"/>
        </g>
        <g class="fsc-eyes fsc-eyes-dizzy">
          <ellipse cx="-3" cy="0" rx="4.6" ry="5.4" fill="#FFFFFF" stroke="#12694F" stroke-width="0.8"/>
          <ellipse cx="8" cy="0" rx="4.6" ry="5.4" fill="#FFFFFF" stroke="#12694F" stroke-width="0.8"/>
          <path d="M-5.5 -2.5L-0.5 2.5M-0.5 -2.5L-5.5 2.5M5.5 -2.5L10.5 2.5M10.5 -2.5L5.5 2.5" stroke="#14222F" stroke-width="1.6" stroke-linecap="round"/>
        </g>
        <path d="M0 8Q4 11 8 8" fill="none" stroke="#14222F" stroke-width="1.2" stroke-linecap="round"/>
        <path class="fsc-tongue" d="M5 9.6L5.6 13M5.6 13L4 15M5.6 13L7.4 15" fill="none" stroke="#E5484D" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>
  </g>`;
