import { Dialog, SessionContext, showDialog } from '@jupyterlab/apputils';
import { CodeEditor, CodeEditorWrapper, IEditorServices } from '@jupyterlab/codeeditor';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { ServiceManager } from '@jupyterlab/services';
import { Panel, SplitPanel, Widget } from '@lumino/widgets';
import { sudoSnakeAvatar } from './art';
import { GameAudio } from './audio';
import { IRunResult } from './engine';
import {
  IMission,
  parseMission,
  serializeMission
} from './format';
import { Runner } from './runner';
import { Stage } from './stage';

const SAVE_DELAY = 1000;

const MASCOT = 'Grep Fox';
const HQ_NAME = 'Sudo Snake';

let nextHqAvatarId = 0;

const COMMANDS: [string, string][] = [
  ['step(distance)', 'Walk forward. A negative number walks backward.'],
  ['turn(degrees)', 'Turn right. A negative number turns left.'],
  ['turn_to(target)', 'Face a chip, a guard or an (x, y) position.'],
  [
    'distance_to(target)',
    'Get the distance to a chip, a guard or an (x, y) position.'
  ],
  ['wait(seconds)', 'Stay still for a number of seconds.'],
  ['chips', 'The list of chips. Each has x, y, trapped and collected.'],
  ['guards', 'The list of guards. Each has x, y and angle.']
];

type Phase = 'starting' | 'idle' | 'running' | 'playing' | 'stopping' | 'broken';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function setInlineCode(node: HTMLElement, text: string): void {
  node.textContent = '';
  text.split('`').forEach((part, index) => {
    if (index % 2) {
      node.appendChild(element('code', '', part));
    } else if (part) {
      node.appendChild(document.createTextNode(part));
    }
  });
}

export interface IFscPanelOptions {
  context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
  editorServices: IEditorServices;
  serviceManager: ServiceManager.IManager;
}

export class FscPanel extends SplitPanel {
  constructor(options: IFscPanelOptions) {
    super({ orientation: 'horizontal', spacing: 3 });
    this.addClass('fsc-panel');
    this._context = options.context;
    this._serviceManager = options.serviceManager;

    this._sessionContext = new SessionContext({
      sessionManager: options.serviceManager.sessions,
      specsManager: options.serviceManager.kernelspecs,
      path: this._context.path,
      type: 'foxsnakecode',
      name: this._context.localPath,
      kernelPreference: {
        language: 'python',
        shouldStart: true,
        canStart: true,
        shutdownOnDispose: true
      }
    });
    this._runner = new Runner(
      this._sessionContext,
      options.serviceManager.kernels
    );
    this._stage = new Stage((collected, total) => {
      this._chipCount.textContent = `Chips ${collected} / ${total}`;
    }, this._audio);

    this._editorModel = new CodeEditor.Model({ mimeType: 'text/x-python' });
    const editor = new CodeEditorWrapper({
      factory: options.editorServices.factoryService.newDocumentEditor,
      model: this._editorModel,
      editorOptions: { config: { lineNumbers: true } }
    });
    editor.addClass('fsc-editor');
    this._editorModel.sharedModel.changed.connect((_, change) => {
      if (change.sourceChange) {
        this._onCodeChanged();
      }
    });

    this.addWidget(this._buildCodeSide(editor));
    this.addWidget(this._buildPlaySide());
    this.setRelativeSizes([0.4, 0.6]);

    this._context.ready.then(() => {
      this._context.model.contentChanged.connect(this._onFileChanged, this);
      this._context.pathChanged.connect(this._onPathChanged, this);
      this._loadFile();
      void this._startKernel();
    });
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    window.clearTimeout(this._saveTimer);
    this._stage.stop();
    this._audio.dispose();
    this._sessionContext.dispose();
    this._editorModel.dispose();
    super.dispose();
  }

  private _buildCodeSide(editor: CodeEditorWrapper): Panel {
    const side = new Panel();
    side.addClass('fsc-code-side');

    const brief = new Widget();
    brief.addClass('fsc-brief');
    this._levelSelect.setAttribute('aria-label', 'Level');
    this._levelSelect.addEventListener('change', () => {
      void this._goToLevel(Number(this._levelSelect.value));
    });
    brief.node.append(this._levelSelect, this._levelTitle);

    const help = element('details', 'fsc-help');
    help.appendChild(element('summary', '', 'Field manual'));
    const commands = element('dl', '');
    for (const [name, description] of COMMANDS) {
      commands.append(element('dt', '', name), element('dd', '', description));
    }
    help.appendChild(commands);
    brief.node.appendChild(help);

    const actions = new Widget();
    actions.addClass('fsc-actions');
    this._runButton.addEventListener('click', () => void this._onRunClicked());
    this._resetButton.addEventListener('click', () => void this._reset());
    this._restoreButton.addEventListener(
      'click',
      () => void this._restoreStarterCode()
    );
    actions.node.append(
      this._runButton,
      this._resetButton,
      this._restoreButton,
      this._status
    );
    this._status.setAttribute('role', 'status');

    const output = new Widget();
    output.addClass('fsc-output-holder');
    output.node.appendChild(this._output);

    side.addWidget(brief);
    side.addWidget(actions);
    side.addWidget(editor);
    side.addWidget(output);
    return side;
  }

  private _buildPlaySide(): Widget {
    const side = new Widget();
    side.addClass('fsc-play-side');

    const header = element('div', 'fsc-hud');
    this._soundButton.addEventListener('click', () => {
      this._audio.setMuted(!this._audio.muted);
      this._renderSoundButton();
    });
    this._renderSoundButton();
    header.append(
      this._missionTitle,
      this._agentName,
      this._chipCount,
      this._soundButton
    );

    const hqAvatar = element('span', 'fsc-hq-avatar');
    hqAvatar.innerHTML = sudoSnakeAvatar(`fsc-hq-clip-${++nextHqAvatarId}`);
    hqAvatar.setAttribute('aria-hidden', 'true');
    const hqMessage = element('div', 'fsc-hq-message');
    hqMessage.append(element('strong', 'fsc-hq-name', HQ_NAME), this._instructions);
    this._hq.append(hqAvatar, hqMessage);

    const stageHolder = element('div', 'fsc-stage');
    stageHolder.appendChild(this._stage.node);

    this._nextButton.addEventListener('click', () => {
      if (this._mission) {
        void this._goToLevel(this._mission.progress.currentLevel + 1);
      }
    });
    this._banner.setAttribute('role', 'status');
    this._banner.append(this._bannerText, this._nextButton);
    this._banner.hidden = true;

    side.node.append(header, this._hq, stageHolder, this._banner);
    return side;
  }

  private _renderSoundButton(): void {
    const on = !this._audio.muted;
    this._soundButton.textContent = on ? 'Sound: on' : 'Sound: off';
    this._soundButton.setAttribute('aria-pressed', String(on));
  }

  private _loadFile(): void {
    const text = this._context.model.toString();
    this._lastFileText = text;
    let mission: IMission;
    try {
      mission = parseMission(text);
    } catch (error) {
      this._mission = null;
      this._setPhase('broken');
      this._showBanner(
        'fail',
        "This mission can't be opened",
        `${(error as Error).message} Use Open With > Editor to fix the file.`
      );
      return;
    }
    this._mission = mission;
    this._missionTitle.textContent = mission.title;
    this._levelSelect.hidden = mission.levels.length < 2;
    this._levelTitle.hidden = mission.levels.length >= 2;
    this._renderLevelOptions();
    this._showLevel(mission.progress.currentLevel);
    if (this._phase === 'broken') {
      this._setPhase(this._kernelReady ? 'idle' : 'starting');
    }
  }

  private _renderLevelOptions(): void {
    const mission = this._mission;
    if (!mission) {
      return;
    }
    this._levelSelect.textContent = '';
    mission.levels.forEach((level, index) => {
      const solved = mission.progress.solved.includes(index);
      const option = element(
        'option',
        '',
        `${solved ? '✓ ' : ''}${level.title}`
      );
      option.value = String(index);
      this._levelSelect.appendChild(option);
    });
    this._levelSelect.value = String(mission.progress.currentLevel);
  }

  private _showLevel(index: number): void {
    const mission = this._mission;
    if (!mission) {
      return;
    }
    const level = mission.levels[index];
    this._levelTitle.textContent = level.title;
    setInlineCode(this._instructions, level.instructions);
    this._hq.hidden = !level.instructions;
    this._banner.hidden = true;
    this._showOutput('');
    this._stage.load(level.scene);
    this._loadingCode = true;
    const code = mission.progress.code[String(index)] ?? level.starterCode;
    this._editorModel.sharedModel.setSource(code);
    this._editorModel.sharedModel.clearUndoHistory();
    this._loadingCode = false;
  }

  private async _goToLevel(index: number): Promise<void> {
    const mission = this._mission;
    if (!mission || index < 0 || index >= mission.levels.length) {
      return;
    }
    await this._halt();
    mission.progress.currentLevel = index;
    this._levelSelect.value = String(index);
    this._showLevel(index);
    this._writeProgress();
  }

  private async _startKernel(): Promise<void> {
    const specsManager = this._serviceManager.kernelspecs;
    try {
      await specsManager.ready;
      const specs = Object.values(specsManager.specs?.kernelspecs ?? {});
      const python = specs.filter(spec => spec?.language === 'python');
      const preferred =
        python.find(spec => spec?.name === 'xpython') ??
        python.find(spec => spec?.name.startsWith('xpython')) ??
        python[0];
      if (!preferred) {
        throw new Error('No Python kernel was found. Install xeus-python.');
      }
      this._sessionContext.kernelPreference = {
        ...this._sessionContext.kernelPreference,
        name: preferred.name
      };
      const needsChoice = await this._sessionContext.initialize();
      if (needsChoice || !this._sessionContext.session?.kernel) {
        throw new Error('The Python kernel did not start.');
      }
      await this._sessionContext.ready;
      this._kernelReady = true;
      if (this._phase === 'starting') {
        this._setPhase('idle');
      }
    } catch (error) {
      if (!this.isDisposed) {
        this._status.textContent = (error as Error).message;
      }
    }
  }

  private async _onRunClicked(): Promise<void> {
    if (this._phase === 'idle') {
      await this._run();
    } else if (this._phase === 'running' || this._phase === 'playing') {
      await this._halt();
      this._stage.reset();
    }
  }

  private async _run(): Promise<void> {
    const mission = this._mission;
    if (!mission) {
      return;
    }
    this._audio.start();
    const levelIndex = mission.progress.currentLevel;
    const runId = ++this._runId;
    this._flushSave();
    this._stage.reset();
    this._banner.hidden = true;
    this._showOutput('');
    this._setPhase('running');
    let result: IRunResult;
    try {
      result = await this._runner.run(
        mission.levels[levelIndex].scene,
        this._editorModel.sharedModel.getSource()
      );
    } catch (error) {
      result = {
        status: 'error',
        events: [],
        error: { type: 'KernelError', message: (error as Error).message }
      };
    }
    if (runId !== this._runId || this.isDisposed) {
      return;
    }
    if (result.status === 'stopped') {
      this._setPhase('idle');
      return;
    }
    this._showOutput(result.output ?? '');
    this._setPhase('playing');
    await this._stage.play(result.events);
    if (runId !== this._runId || this.isDisposed) {
      return;
    }
    this._setPhase('idle');
    this._showResult(result, levelIndex);
  }

  private async _halt(): Promise<void> {
    this._runId++;
    this._stage.stop();
    if (this._phase === 'running') {
      this._setPhase('stopping');
      await this._runner.stop();
    }
    if (this._phase !== 'broken' && this._phase !== 'starting') {
      this._setPhase('idle');
    }
  }

  private async _reset(): Promise<void> {
    await this._halt();
    this._stage.reset();
    this._banner.hidden = true;
    this._showOutput('');
  }

  private async _restoreStarterCode(): Promise<void> {
    const mission = this._mission;
    if (!mission) {
      return;
    }
    const answer = await showDialog({
      title: 'Restore the starter code?',
      body: 'Your code for this level will be replaced.',
      buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Restore' })]
    });
    if (answer.button.accept) {
      const level = mission.levels[mission.progress.currentLevel];
      this._editorModel.sharedModel.setSource(level.starterCode);
    }
  }

  private _showResult(result: IRunResult, levelIndex: number): void {
    const mission = this._mission;
    if (!mission) {
      return;
    }
    switch (result.status) {
      case 'solved': {
        this._stage.setOutcome('win');
        this._audio.win();
        if (!mission.progress.solved.includes(levelIndex)) {
          mission.progress.solved.push(levelIndex);
          mission.progress.solved.sort((a, b) => a - b);
          this._writeProgress();
          this._renderLevelOptions();
        }
        const hasNext = levelIndex + 1 < mission.levels.length;
        const cleared =
          mission.progress.solved.length === mission.levels.length;
        this._showBanner(
          'win',
          cleared ? 'MISSION ACCOMPLISHED' : 'OBJECTIVE SECURED',
          cleared
            ? `${MASCOT} vanished without a trace.`
            : hasNext
            ? `${MASCOT} slipped out with the data.`
            : `${MASCOT} slipped out with the data. Some earlier objectives are still open.`,
          hasNext
        );
        return;
      }
      case 'failed': {
        this._stage.setOutcome(result.reason === 'guard' ? 'spotted' : 'fail');
        this._audio.alarm();
        const messages: Record<string, [string, string]> = {
          light: [
            "ALERT: YOU'VE BEEN SPOTTED",
            `The searchlight found ${MASCOT}. Stay in the shadows.`
          ],
          laser: [
            'ALARM TRIPPED',
            `${MASCOT} broke a laser beam. Plot a new route.`
          ],
          trap: ['DECOY CHIP', 'It was rigged. Check .trapped before you grab.'],
          guard: [
            "ALERT: YOU'VE BEEN SPOTTED",
            'Stay out of the vision cone, or put a crate between you.'
          ]
        };
        const [title, detail] = messages[result.reason ?? ''] ?? [
          'ALARM TRIPPED',
          `${MASCOT} was detected. Plot a new route.`
        ];
        this._showBanner('fail', title, detail);
        return;
      }
      case 'incomplete': {
        const left = mission.levels[levelIndex].scene.chips.filter(
          chip => !chip.trapped
        ).length;
        const taken = new Set<number>();
        for (const event of result.events) {
          if (event.t === 'move') {
            event.picked.forEach(pick => taken.add(pick.i));
          }
        }
        const remaining = left - taken.size;
        this._showBanner(
          'info',
          'OBJECTIVE INCOMPLETE',
          `Your orders ran out with ${remaining} ${
            remaining === 1 ? 'chip' : 'chips'
          } still in the building.`
        );
        return;
      }
      case 'error': {
        this._stage.setOutcome('fail');
        const error = result.error ?? {};
        if (error.kind === 'too-long') {
          this._showBanner(
            'fail',
            'MISSION TIMEOUT',
            'Your orders never end. Check for an endless loop.'
          );
          return;
        }
        const where = error.line ? `Line ${error.line}: ` : '';
        const message = error.message ? `: ${error.message}` : '';
        this._showBanner(
          'fail',
          'ORDERS NOT UNDERSTOOD',
          `${where}${error.type ?? 'Error'}${message}`
        );
        return;
      }
    }
  }

  private _showBanner(
    kind: 'win' | 'fail' | 'info',
    title: string,
    detail: string,
    next = false
  ): void {
    this._banner.dataset.kind = kind;
    this._bannerText.textContent = '';
    this._bannerText.append(
      element('strong', '', title),
      element('span', '', detail)
    );
    this._nextButton.hidden = !next;
    this._banner.hidden = false;
  }

  private _showOutput(text: string): void {
    const trimmed = text.replace(/\s+$/, '');
    this._output.textContent = trimmed;
    this._output.hidden = !trimmed;
  }

  private _setPhase(phase: Phase): void {
    this._phase = phase;
    const busy = phase === 'running' || phase === 'playing';
    this._runButton.textContent = busy ? 'Stop' : 'Run';
    this._runButton.classList.toggle('jp-mod-accept', !busy);
    this._runButton.classList.toggle('jp-mod-warn', busy);
    this._runButton.disabled = !busy && phase !== 'idle';
    const usable = phase !== 'broken' && phase !== 'stopping';
    this._resetButton.disabled = !usable;
    this._restoreButton.disabled = !usable;
    const messages: Record<Phase, string> = {
      starting: 'Establishing kernel link…',
      idle: '',
      running: 'Operation under way…',
      playing: '',
      stopping: 'Stopping…',
      broken: ''
    };
    this._status.textContent = messages[phase];
  }

  private _onCodeChanged(): void {
    const mission = this._mission;
    if (!mission || this._loadingCode) {
      return;
    }
    const key = String(mission.progress.currentLevel);
    mission.progress.code[key] = this._editorModel.sharedModel.getSource();
    this._writeProgress();
  }

  private _writeProgress(): void {
    const mission = this._mission;
    if (!mission) {
      return;
    }
    const text = serializeMission(mission);
    if (text === this._lastFileText) {
      return;
    }
    this._lastFileText = text;
    this._context.model.fromString(text);
    window.clearTimeout(this._saveTimer);
    this._saveTimer = window.setTimeout(() => {
      this._saveTimer = 0;
      void this._context.save();
    }, SAVE_DELAY);
  }

  private _flushSave(): void {
    if (this._saveTimer) {
      window.clearTimeout(this._saveTimer);
      this._saveTimer = 0;
      void this._context.save();
    }
  }

  private _onFileChanged(): void {
    if (this._context.model.toString() !== this._lastFileText) {
      void this._halt().then(() => this._loadFile());
    }
  }

  private _onPathChanged(): void {
    void this._sessionContext.session?.setPath(this._context.path);
  }

  private _context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
  private _serviceManager: ServiceManager.IManager;
  private _sessionContext: SessionContext;
  private _runner: Runner;
  private _stage: Stage;
  private _audio = new GameAudio(() => this.isVisible && !document.hidden);
  private _editorModel: CodeEditor.Model;
  private _mission: IMission | null = null;
  private _phase: Phase = 'starting';
  private _kernelReady = false;
  private _runId = 0;
  private _loadingCode = false;
  private _lastFileText = '';
  private _saveTimer = 0;

  private _levelSelect = element('select', 'jp-mod-styled fsc-level-select');
  private _levelTitle = element('h2', 'fsc-level-title');
  private _instructions = element('p', 'fsc-instructions');
  private _hq = element('div', 'fsc-hq');
  private _runButton = element('button', 'jp-Button jp-mod-styled jp-mod-accept fsc-run', 'Run');
  private _resetButton = element('button', 'jp-Button jp-mod-styled jp-mod-reject', 'Reset');
  private _restoreButton = element('button', 'fsc-link-button', 'Restore starter code');
  private _status = element('span', 'fsc-status', 'Establishing kernel link…');
  private _output = element('pre', 'fsc-output');
  private _missionTitle = element('span', 'fsc-mission-title');
  private _agentName = element('span', 'fsc-agent-name', MASCOT);
  private _soundButton = element('button', 'fsc-sound-button');
  private _chipCount = element('span', 'fsc-chip-count');
  private _banner = element('div', 'fsc-banner');
  private _bannerText = element('div', 'fsc-banner-text');
  private _nextButton = element('button', 'jp-Button jp-mod-styled jp-mod-accept', 'Next mission');
}
