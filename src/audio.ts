const MASTER_VOLUME = 0.6;
const MUSIC_VOLUME = 0.22;
const EFFECTS_VOLUME = 0.7;
const MUSIC_STEP_TIME = 0.15;
const MUSIC_LOOKAHEAD = 0.2;
const MUSIC_TIMER = 50;
const FOOTSTEP_GAP = 0.09;
const TURN_GAP = 0.06;

const BASS = [
  45, 0, 0, 45, 0, 0, 45, 0, 45, 0, 0, 48, 0, 0, 43, 0, 41, 0, 0, 41, 0, 0, 41,
  0, 40, 0, 0, 40, 0, 43, 0, 0
];
const LEAD = [
  0, 0, 0, 0, 76, 0, 0, 0, 0, 0, 72, 0, 0, 0, 0, 0, 0, 0, 0, 0, 77, 0, 0, 0, 0,
  0, 76, 0, 0, 74, 0, 0
];

function frequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

interface IToneOptions {
  start: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  frequency: number;
  endFrequency?: number;
  output: AudioNode;
}

export class GameAudio {
  constructor(isAudible: () => boolean) {
    this._isAudible = isAudible;
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this._master) {
      this._master.gain.value = muted ? 0 : MASTER_VOLUME;
    }
  }

  start(): void {
    if (this._context) {
      void this._context.resume();
      return;
    }
    const context = new AudioContext();
    this._context = context;
    this._master = context.createGain();
    this._master.gain.value = this._muted ? 0 : MASTER_VOLUME;
    this._master.connect(context.destination);

    const musicFilter = context.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 1800;
    musicFilter.connect(this._master);
    this._music = context.createGain();
    this._music.gain.value = MUSIC_VOLUME;
    this._music.connect(musicFilter);

    this._effects = context.createGain();
    this._effects.gain.value = EFFECTS_VOLUME;
    this._effects.connect(this._master);

    const samples = Math.floor(context.sampleRate * 0.2);
    this._noiseBuffer = context.createBuffer(1, samples, context.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples; index++) {
      data[index] = Math.random() * 2 - 1;
    }

    this._nextStepTime = context.currentTime + 0.05;
    this._musicTimer = window.setInterval(
      () => this._scheduleMusic(),
      MUSIC_TIMER
    );
    void context.resume();
  }

  footstep(): void {
    const context = this._context;
    if (!context || !this._effects) {
      return;
    }
    if (context.currentTime - this._lastFootstep < FOOTSTEP_GAP) {
      return;
    }
    this._lastFootstep = context.currentTime;
    this._noise(context.currentTime, 0.05, 0.5, 'lowpass', 900, this._effects);
  }

  turn(): void {
    const context = this._context;
    if (!context || !this._effects) {
      return;
    }
    if (context.currentTime - this._lastTurn < TURN_GAP) {
      return;
    }
    this._lastTurn = context.currentTime;
    this._tone({
      start: context.currentTime,
      duration: 0.08,
      type: 'triangle',
      volume: 0.35,
      frequency: 520,
      endFrequency: 720,
      output: this._effects
    });
  }

  bump(): void {
    const context = this._context;
    if (!context || !this._effects) {
      return;
    }
    this._tone({
      start: context.currentTime,
      duration: 0.16,
      type: 'triangle',
      volume: 0.7,
      frequency: 120,
      endFrequency: 55,
      output: this._effects
    });
    this._noise(context.currentTime, 0.07, 0.35, 'lowpass', 500, this._effects);
  }

  chip(): void {
    this._melody([81, 88], 0.08, 'square', 0.16);
  }

  win(): void {
    this._melody([72, 76, 79, 84], 0.11, 'square', 0.18);
  }

  alarm(): void {
    this._melody([79, 74, 79, 74], 0.13, 'sawtooth', 0.14);
  }

  dispose(): void {
    window.clearInterval(this._musicTimer);
    void this._context?.close();
    this._context = null;
  }

  private _scheduleMusic(): void {
    const context = this._context;
    if (!context || !this._music) {
      return;
    }
    if (!this._isAudible()) {
      this._nextStepTime = context.currentTime + 0.05;
      return;
    }
    while (this._nextStepTime < context.currentTime + MUSIC_LOOKAHEAD) {
      this._playMusicStep(this._musicStep, this._nextStepTime, this._music);
      this._musicStep = (this._musicStep + 1) % BASS.length;
      this._nextStepTime += MUSIC_STEP_TIME;
    }
  }

  private _playMusicStep(step: number, time: number, output: AudioNode): void {
    if (BASS[step]) {
      this._tone({
        start: time,
        duration: MUSIC_STEP_TIME * 1.6,
        type: 'triangle',
        volume: 0.8,
        frequency: frequency(BASS[step]),
        output
      });
    }
    if (LEAD[step]) {
      this._tone({
        start: time,
        duration: MUSIC_STEP_TIME * 2.5,
        type: 'square',
        volume: 0.14,
        frequency: frequency(LEAD[step]),
        output
      });
    }
    if (step % 2 === 0) {
      this._noise(time, 0.025, 0.1, 'highpass', 6000, output);
    }
  }

  private _melody(
    notes: number[],
    noteTime: number,
    type: OscillatorType,
    volume: number
  ): void {
    const context = this._context;
    const output = this._effects;
    if (!context || !output) {
      return;
    }
    notes.forEach((note, index) => {
      this._tone({
        start: context.currentTime + index * noteTime,
        duration: noteTime * 1.2,
        type,
        volume,
        frequency: frequency(note),
        output
      });
    });
  }

  private _tone(options: IToneOptions): void {
    const context = this._context;
    if (!context) {
      return;
    }
    const { start, duration, volume } = options;
    const oscillator = context.createOscillator();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.frequency, start);
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        options.endFrequency,
        start + duration
      );
    }
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(options.output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private _noise(
    start: number,
    duration: number,
    volume: number,
    filterType: BiquadFilterType,
    filterFrequency: number,
    output: AudioNode
  ): void {
    const context = this._context;
    if (!context || !this._noiseBuffer) {
      return;
    }
    const source = context.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFrequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private _isAudible: () => boolean;
  private _muted = false;
  private _context: AudioContext | null = null;
  private _master: GainNode | null = null;
  private _music: GainNode | null = null;
  private _effects: GainNode | null = null;
  private _noiseBuffer: AudioBuffer | null = null;
  private _musicTimer = 0;
  private _musicStep = 0;
  private _nextStepTime = 0;
  private _lastFootstep = -1;
  private _lastTurn = -1;
}
