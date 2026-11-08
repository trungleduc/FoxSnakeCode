import { Dialog, SessionContext, showDialog } from '@jupyterlab/apputils';
import { CodeEditor, CodeEditorWrapper, IEditorServices } from '@jupyterlab/codeeditor';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { ServiceManager } from '@jupyterlab/services';
import { Panel, SplitPanel, Widget } from '@lumino/widgets';
import { sudoSnakeAvatar, TOOL_ICONS } from './art';
import { GameAudio } from './audio';
import { IRunResult } from './engine';
import {
  IMission,
  isUnlocked,
  parseMission,
  serializeMission
} from './format';
import { HintService, hintInstructions, IHintMessage } from './hint';
import { MissionMap } from './map';
import { Runner } from './runner';
import { Stage } from './stage';

const SAVE_DELAY = 1000;
const MAX_HINT_LENGTH = 300;
const MAX_HINT_QUESTIONS = 10;
const HINT_CARD_GAP = 8;
const HINT_CARD_MAX_HEIGHT = 400;
const HINT_CONNECT_NOTICE =
  'Connect an AI provider and I can give you hints on this mission.';
const HINT_INSTALL_NOTICE =
  'Hints need the jupyter-ai-lite extension. Install it with `pip install jupyter-ai-lite`, then restart JupyterLab. On a hosted site, ask whoever runs it to add it.';
const HINT_STARTERS = [
  'Where do I start?',
  'Why did my run fail?',
  'What is this level teaching me?'
];

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

const TOOLS: [string, string, string][] = [
  ['step', TOOL_ICONS.step, 'step(100)'],
  ['left', TOOL_ICONS.left, 'turn(-90)'],
  ['right', TOOL_ICONS.right, 'turn(90)'],
  ['face', TOOL_ICONS.face, 'turn_to(chips[0])'],
  ['wait', TOOL_ICONS.wait, 'wait(1)']
];

const MORE_TOOLS = [
  'step(distance_to(chips[0]))',
  'for i in range(4):\n    ',
  'if not c.trapped:\n    ',
  'def grab(chip):\n    '
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
  hints: HintService | null;
}

export class FscPanel extends SplitPanel {
  constructor(options: IFscPanelOptions) {
    super({ orientation: 'horizontal', spacing: 3 });
    this.addClass('fsc-panel');
    this._context = options.context;
    this._serviceManager = options.serviceManager;
    this._hints = options.hints;
    this._hints?.stateChanged.connect(this._renderHintState, this);

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
    this._editor = new CodeEditorWrapper({
      factory: options.editorServices.factoryService.newDocumentEditor,
      model: this._editorModel,
      editorOptions: { config: { lineNumbers: true } }
    });
    this._editor.addClass('fsc-editor');
    this._editorModel.sharedModel.changed.connect((_, change) => {
      if (change.sourceChange) {
        this._onCodeChanged();
      }
    });

    this.addWidget(this._buildCodeSide());
    this.addWidget(this._buildPlaySide());
    this.setRelativeSizes([0.4, 0.6]);

    this._map = new MissionMap(index => void this._goToLevel(index));
    this._map.setMessage('Establishing kernel link…');
    this.node.appendChild(this._map.node);

    this._context.ready.then(() => {
      this._context.model.contentChanged.connect(this._onFileChanged, this);
      this._context.pathChanged.connect(this._onPathChanged, this);
      void this._startKernel();
    });
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    window.clearTimeout(this._saveTimer);
    this._hintResize.disconnect();
    this._stage.stop();
    this._audio.dispose();
    this._sessionContext.dispose();
    this._editorModel.dispose();
    super.dispose();
  }

  private _buildCodeSide(): Panel {
    const side = new Panel();
    side.addClass('fsc-code-side');

    const brief = new Widget();
    brief.addClass('fsc-brief');

    const help = element('details', 'fsc-help');
    help.appendChild(element('summary', '', 'Field manual'));
    const commands = element('dl', '');
    for (const [name, description] of COMMANDS) {
      commands.append(element('dt', '', name), element('dd', '', description));
    }
    help.appendChild(commands);
    brief.node.append(help, this._hintButton);

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
    side.addWidget(this._editor);
    side.addWidget(output);
    side.addWidget(actions);
    side.addWidget(this._buildToolbar());
    side.node.appendChild(this._buildHintChat());
    this._hintResize.observe(side.node);
    this._hintResize.observe(this._editor.node);
    return side;
  }

  private _buildToolbar(): Widget {
    const toolbar = this._toolbar;
    toolbar.addClass('fsc-toolbar');
    for (const [label, icon, code] of TOOLS) {
      const button = element('button', 'fsc-tool');
      button.innerHTML = icon;
      button.appendChild(element('span', '', label));
      button.title = code;
      button.addEventListener('click', () => this._insertCode(code));
      toolbar.node.appendChild(button);
    }

    const more = element('div', 'fsc-more');
    const menu = element('div', 'fsc-more-menu');
    menu.hidden = true;
    for (const code of MORE_TOOLS) {
      const item = element('button', 'fsc-more-item', code.trimEnd());
      item.addEventListener('click', () => {
        menu.hidden = true;
        this._insertCode(code);
      });
      menu.appendChild(item);
    }
    const toggle = element('button', 'fsc-tool');
    toggle.innerHTML = TOOL_ICONS.more;
    toggle.appendChild(element('span', '', 'more'));
    toggle.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
    });
    this.node.addEventListener('pointerdown', event => {
      if (!more.contains(event.target as Node)) {
        menu.hidden = true;
      }
    });
    more.append(menu, toggle);
    toolbar.node.appendChild(more);
    return toolbar;
  }

  private _insertCode(code: string): void {
    const editor = this._editor.editor;
    const shared = this._editorModel.sharedModel;
    const { line } = editor.getCursorPosition();
    const lines = shared.getSource().split('\n');
    const current = lines[line] ?? '';
    const blank = !current.trim();
    const indent =
      (/^\s*/.exec(current)?.[0] ?? '') +
      (current.trimEnd().endsWith(':') ? '    ' : '');
    const parts = code.split('\n').map(part => indent + part);
    const text = parts.join('\n');
    const start = lines.slice(0, line).join('\n').length + (line ? 1 : 0);
    const end = start + current.length;
    if (blank) {
      shared.updateSource(start, end, text);
    } else {
      shared.updateSource(end, end, `\n${text}`);
    }
    editor.setCursorPosition({
      line: line + (blank ? 0 : 1) + parts.length - 1,
      column: parts[parts.length - 1].length
    });
    editor.focus();
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
    this._mapButton.addEventListener('click', () => void this._openMap());
    header.append(
      this._mapButton,
      this._levelTitle,
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
    stageHolder.append(this._stage.node, this._stage.card);

    this._nextButton.addEventListener('click', () => {
      if (this._mission) {
        void this._goToLevel(this._currentIndex() + 1);
      }
    });
    this._banner.setAttribute('role', 'status');
    this._banner.append(this._bannerText, this._nextButton);
    this._banner.hidden = true;

    side.node.append(header, this._hq, stageHolder, this._banner);
    return side;
  }

  private _buildHintChat(): HTMLElement {
    const card = this._hintCard;
    card.hidden = true;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', `Chat with ${HQ_NAME}`);
    card.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this._closeHintChat();
        this._hintButton.focus();
      }
    });
    this._hintButton.setAttribute('aria-expanded', 'false');
    this._hintButton.addEventListener('click', () => {
      if (this._hintCard.hidden) {
        this._openHintChat();
      } else {
        this._closeHintChat();
      }
    });

    const head = element('div', 'fsc-chat-head');
    const avatar = element('span', 'fsc-chat-avatar');
    avatar.innerHTML = sudoSnakeAvatar(`fsc-hq-clip-${++nextHqAvatarId}`);
    avatar.setAttribute('aria-hidden', 'true');
    const title = element('div', 'fsc-chat-title');
    title.append(
      element('strong', '', HQ_NAME),
      element('span', '', 'Hints for this mission')
    );
    const close = element('button', 'fsc-chat-close');
    close.innerHTML = TOOL_ICONS.close;
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this._closeHintChat());
    head.append(avatar, title, close);

    this._hintLog.setAttribute('aria-live', 'polite');
    for (const prompt of HINT_STARTERS) {
      const starter = element('button', 'fsc-chat-starter', prompt);
      starter.type = 'button';
      starter.addEventListener('click', () => {
        void this._sendHintQuestion(prompt);
      });
      this._hintStarters.appendChild(starter);
    }
    this._hintSetup.type = 'button';
    this._hintSetup.addEventListener('click', () => {
      this._hints?.openSettings();
    });
    this._hintBody.append(
      this._hintLog,
      this._hintNotice,
      this._hintStarters,
      this._hintSetup
    );

    this._hintInput.type = 'text';
    this._hintInput.maxLength = MAX_HINT_LENGTH;
    this._hintInput.placeholder = 'Ask about this mission…';
    this._hintInput.setAttribute('aria-label', 'Your question');
    this._hintSend.innerHTML = TOOL_ICONS.send;
    this._hintSend.setAttribute('aria-label', 'Send');
    this._hintForm.append(this._hintInput, this._hintSend);
    this._hintForm.addEventListener('submit', event => {
      event.preventDefault();
      void this._sendHintQuestion(this._hintInput.value);
    });

    card.append(head, this._hintBody, this._hintForm);
    return card;
  }

  private _openHintChat(): void {
    this._hintCard.hidden = false;
    this._hintButton.setAttribute('aria-expanded', 'true');
    this._renderHintState();
    this._placeHintCard();
    this._scrollHintChat();
    if (!this._hintForm.hidden) {
      this._hintInput.focus();
    }
  }

  private _closeHintChat(): void {
    this._hintCard.hidden = true;
    this._hintButton.setAttribute('aria-expanded', 'false');
  }

  private _placeHintCard(): void {
    const card = this._hintCard;
    const side = card.parentElement;
    if (card.hidden || !side) {
      return;
    }
    const editor = this._editor.node;
    const editorBottom = editor.offsetTop + editor.offsetHeight;
    card.style.bottom = `${side.clientHeight - editorBottom + HINT_CARD_GAP}px`;
    card.style.height = `${Math.min(
      editor.offsetHeight - 2 * HINT_CARD_GAP,
      HINT_CARD_MAX_HEIGHT
    )}px`;
  }

  private _renderHintState(): void {
    const ready = !!this._hints?.ready;
    setInlineCode(
      this._hintNotice,
      this._hints ? HINT_CONNECT_NOTICE : HINT_INSTALL_NOTICE
    );
    this._hintNotice.hidden = ready;
    this._hintSetup.hidden = !this._hints || (ready && !this._hintFailed);
    this._hintForm.hidden = !ready || this._hintCapped;
    this._hintStarters.hidden = !ready || this._hintLog.hasChildNodes();
  }

  private _scrollHintChat(): void {
    this._hintBody.scrollTop = this._hintBody.scrollHeight;
  }

  private _addHintMessage(from: 'you' | 'hq', text: string): HTMLElement {
    const message = element('div', `fsc-msg fsc-hint-${from}`);
    if (from === 'hq') {
      const avatar = element('span', 'fsc-msg-avatar');
      avatar.innerHTML = sudoSnakeAvatar(`fsc-hq-clip-${++nextHqAvatarId}`);
      avatar.setAttribute('aria-hidden', 'true');
      message.appendChild(avatar);
    }
    const bubble = element('div', 'fsc-bubble');
    setInlineCode(bubble, text);
    message.appendChild(bubble);
    this._hintLog.appendChild(message);
    this._scrollHintChat();
    return bubble;
  }

  private _resetHintChat(): void {
    this._hintRequest++;
    this._hintHistory = [];
    this._hintOutcome = '';
    this._hintFailed = false;
    this._hintCapped = false;
    this._hintLog.textContent = '';
    this._hintInput.value = '';
    this._hintInput.disabled = false;
    this._hintSend.disabled = false;
    this._closeHintChat();
  }

  private async _sendHintQuestion(text: string): Promise<void> {
    const mission = this._mission;
    const question = text.trim();
    if (!this._hints || !mission || !question || this._hintSend.disabled) {
      return;
    }
    const asked = this._hintHistory.filter(item => item.role === 'user').length;
    if (asked >= MAX_HINT_QUESTIONS) {
      this._addHintMessage(
        'hq',
        "That's all the help HQ can give on this mission. Trust your code and try it."
      );
      this._hintCapped = true;
      this._renderHintState();
      return;
    }
    this._hintInput.value = '';
    this._hintFailed = false;
    this._addHintMessage('you', question);
    this._hintHistory.push({ role: 'user', content: question });
    const reply = this._addHintMessage('hq', '');
    reply.setAttribute('aria-label', 'Thinking');
    const dots = element('span', 'fsc-typing');
    dots.append(element('i', ''), element('i', ''), element('i', ''));
    reply.appendChild(dots);
    this._renderHintState();
    const request = ++this._hintRequest;
    this._hintInput.disabled = true;
    this._hintSend.disabled = true;
    try {
      const answer = await this._hints.ask(
        hintInstructions(
          mission.levels[this._currentIndex()],
          this._editorModel.sharedModel.getSource(),
          this._hintOutcome
        ),
        this._hintHistory
      );
      if (request !== this._hintRequest) {
        return;
      }
      this._hintHistory.push({ role: 'assistant', content: answer });
      setInlineCode(reply, answer.replace(/```[a-z]*\n?/gi, '`'));
    } catch (error) {
      if (request !== this._hintRequest) {
        return;
      }
      this._hintHistory.pop();
      this._hintFailed = true;
      setInlineCode(
        reply,
        `I can't reach HQ right now: ${(error as Error).message}`
      );
    }
    reply.removeAttribute('aria-label');
    this._hintInput.disabled = false;
    this._hintSend.disabled = false;
    this._renderHintState();
    this._scrollHintChat();
    this._hintInput.focus();
  }

  private _renderSoundButton(): void {
    const on = !this._audio.muted;
    this._soundButton.textContent = on ? 'Sound: on' : 'Sound: off';
    this._soundButton.setAttribute('aria-pressed', String(on));
  }

  private _currentIndex(): number {
    const mission = this._mission;
    return mission
      ? mission.levels.findIndex(
          level => level.id === mission.progress.currentLevel
        )
      : -1;
  }

  private _loadFile(): void {
    if (this._missionsText === null) {
      return;
    }
    const text = this._context.model.toString();
    this._lastFileText = text;
    let mission: IMission;
    try {
      mission = parseMission(this._missionsText, text);
    } catch (error) {
      this._mission = null;
      this._map.hide();
      this._setPhase('broken');
      this._showBanner(
        'fail',
        "This mission can't be opened",
        `${(error as Error).message} Use Open With > Editor to fix the file.`
      );
      return;
    }
    this._mission = mission;
    this._showMap();
    if (this._phase === 'broken') {
      this._setPhase(this._kernelReady ? 'idle' : 'starting');
    }
  }

  private _showMap(): void {
    if (this._mission) {
      this._map.render(this._mission, this._currentIndex());
      this._map.show();
    }
  }

  private async _openMap(): Promise<void> {
    if (this._mission) {
      this._closeHintChat();
      await this._reset();
      this._showMap();
    }
  }

  private _showLevel(index: number): void {
    const mission = this._mission;
    if (!mission) {
      return;
    }
    const level = mission.levels[index];
    this._levelTitle.textContent = `${index + 1} · ${level.title}`;
    setInlineCode(this._instructions, level.instructions);
    this._hq.hidden = !level.instructions;
    this._resetHintChat();
    this._banner.hidden = true;
    this._showOutput('');
    this._stage.load(level.scene);
    this._loadingCode = true;
    const code = mission.progress.code[level.id] ?? level.starterCode;
    this._editorModel.sharedModel.setSource(code);
    this._editorModel.sharedModel.clearUndoHistory();
    this._loadingCode = false;
    const lines = code.split('\n');
    this._editor.editor.setCursorPosition({
      line: lines.length - 1,
      column: lines[lines.length - 1].length
    });
  }

  private async _goToLevel(index: number): Promise<void> {
    const mission = this._mission;
    if (
      !mission ||
      index < 0 ||
      index >= mission.levels.length ||
      !isUnlocked(mission, index)
    ) {
      return;
    }
    await this._halt();
    mission.progress.currentLevel = mission.levels[index].id;
    this._showLevel(index);
    this._map.hide();
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
      this._missionsText = await this._runner.loadMissions();
      if (this.isDisposed) {
        return;
      }
      this._kernelReady = true;
      this._map.setMessage('');
      this._loadFile();
      if (this._phase === 'starting') {
        this._setPhase('idle');
      }
    } catch (error) {
      if (!this.isDisposed) {
        this._map.setMessage((error as Error).message);
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
    const levelIndex = this._currentIndex();
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
    this._hintOutcome = [
      result.status,
      result.reason,
      result.error?.line ? `line ${result.error.line}` : '',
      result.error?.type,
      result.error?.message
    ]
      .filter(Boolean)
      .join(' ');
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
      const level = mission.levels[this._currentIndex()];
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
        const level = mission.levels[levelIndex];
        if (!mission.progress.solved.includes(level.id)) {
          mission.progress.solved.push(level.id);
          this._writeProgress();
        }
        const hasNext = levelIndex + 1 < mission.levels.length;
        const cleared =
          mission.progress.solved.length === mission.levels.length;
        this._showBanner(
          'win',
          cleared
            ? 'MISSION ACCOMPLISHED'
            : level.boss
            ? 'BOSS DEFEATED'
            : 'OBJECTIVE SECURED',
          cleared
            ? `${MASCOT} vanished without a trace.`
            : level.boss
            ? `${MASCOT} outsmarted the boss. The next sector is open.`
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
    this._toolbar.node.querySelectorAll('button').forEach(button => {
      button.disabled = !usable;
    });
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
    const key = mission.progress.currentLevel;
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
  private _hints: HintService | null;
  private _hintHistory: IHintMessage[] = [];
  private _hintOutcome = '';
  private _hintRequest = 0;
  private _hintFailed = false;
  private _hintCapped = false;
  private _hintResize = new ResizeObserver(() => this._placeHintCard());
  private _sessionContext: SessionContext;
  private _runner: Runner;
  private _stage: Stage;
  private _map: MissionMap;
  private _audio = new GameAudio(() => this.isVisible && !document.hidden);
  private _editorModel: CodeEditor.Model;
  private _editor: CodeEditorWrapper;
  private _toolbar = new Widget();
  private _missionsText: string | null = null;
  private _mission: IMission | null = null;
  private _phase: Phase = 'starting';
  private _kernelReady = false;
  private _runId = 0;
  private _loadingCode = false;
  private _lastFileText = '';
  private _saveTimer = 0;

  private _levelTitle = element('span', 'fsc-level-title');
  private _instructions = element('p', 'fsc-instructions');
  private _hq = element('div', 'fsc-hq');
  private _hintCard = element('div', 'fsc-chat');
  private _hintBody = element('div', 'fsc-chat-body');
  private _hintLog = element('div', 'fsc-hint-log');
  private _hintNotice = element('p', 'fsc-chat-notice');
  private _hintStarters = element('div', 'fsc-chat-starters');
  private _hintForm = element('form', 'fsc-hint-form');
  private _hintInput = element('input', 'fsc-hint-input');
  private _hintSend = element('button', 'fsc-hint-send');
  private _hintButton = element('button', 'fsc-chat-open', 'Ask Sudo Snake');
  private _hintSetup = element('button', 'fsc-chat-connect', 'Connect AI');
  private _runButton = element('button', 'jp-Button jp-mod-styled jp-mod-accept fsc-run', 'Run');
  private _resetButton = element('button', 'jp-Button jp-mod-styled jp-mod-reject', 'Reset');
  private _restoreButton = element('button', 'fsc-link-button', 'Restore starter code');
  private _status = element('span', 'fsc-status', 'Establishing kernel link…');
  private _output = element('pre', 'fsc-output');
  private _agentName = element('span', 'fsc-agent-name', MASCOT);
  private _soundButton = element('button', 'fsc-sound-button');
  private _mapButton = element('button', 'fsc-map-button', 'Map');
  private _chipCount = element('span', 'fsc-chip-count');
  private _banner = element('div', 'fsc-banner');
  private _bannerText = element('div', 'fsc-banner-text');
  private _nextButton = element('button', 'jp-Button jp-mod-styled jp-mod-accept', 'Next mission');
}
