import { ISessionContext } from '@jupyterlab/apputils';
import { Kernel, KernelMessage } from '@jupyterlab/services';
import { buildRunCode, IRunResult, readRunOutput } from './engine';
import { IScene } from './format';

const READY_TIMEOUT = 30000;
const READY_ATTEMPT_TIME = 1000;
const READY_RETRY_DELAY = 200;

function delay(time: number): Promise<undefined> {
  return new Promise(resolve => {
    window.setTimeout(() => resolve(undefined), time);
  });
}

export class Runner {
  constructor(sessionContext: ISessionContext) {
    this._sessionContext = sessionContext;
  }

  async run(scene: IScene, code: string): Promise<IRunResult> {
    this._stopRequested = false;
    let finished: () => void = () => undefined;
    this._running = new Promise<void>(resolve => {
      finished = resolve;
    });
    const abandoned = new Promise<void>(resolve => {
      this._abandon = resolve;
    });
    try {
      return await this._execute(scene, code, abandoned);
    } finally {
      this._abandon = null;
      finished();
      this._running = null;
    }
  }

  async stop(): Promise<void> {
    const running = this._running;
    if (!running) {
      return;
    }
    this._stopRequested = true;
    await this._sessionContext.restartKernel().catch(() => undefined);
    this._abandon?.();
    await running;
  }

  private async _execute(
    scene: IScene,
    code: string,
    abandoned: Promise<void>
  ): Promise<IRunResult> {
    const kernel = await Promise.race([
      this._readyKernel(),
      abandoned.then(() => null)
    ]);
    if (!kernel || this._stopRequested) {
      return { status: 'stopped', events: [] };
    }
    let stdout = '';
    let stderr = '';
    let kernelError = '';
    const future = kernel.requestExecute({
      code: buildRunCode(scene, code),
      silent: false,
      store_history: false,
      allow_stdin: false,
      stop_on_error: true
    });
    future.onIOPub = message => {
      if (KernelMessage.isStreamMsg(message)) {
        if (message.content.name === 'stdout') {
          stdout += message.content.text;
        } else {
          stderr += message.content.text;
        }
      } else if (KernelMessage.isErrorMsg(message)) {
        kernelError = `${message.content.ename}: ${message.content.evalue}`;
      }
    };
    try {
      await Promise.race([future.done, abandoned]);
    } catch (error) {
      kernelError = kernelError || (error as Error).message;
    }
    future.dispose();

    if (this._stopRequested) {
      return { status: 'stopped', events: [] };
    }
    const result = readRunOutput(stdout);
    if (!result) {
      return {
        status: 'error',
        events: [],
        error: {
          type: 'KernelError',
          message: kernelError || 'The kernel did not return a result.'
        },
        output: stdout + stderr
      };
    }
    result.output = (result.output ?? '') + stderr;
    return result;
  }

  private async _readyKernel(): Promise<Kernel.IKernelConnection> {
    const session = this._sessionContext.session;
    if (session?.kernel?.status === 'dead') {
      await this._reviveKernel();
    }
    const deadline = Date.now() + READY_TIMEOUT;
    while (Date.now() < deadline) {
      const kernel = this._sessionContext.session?.kernel;
      if (kernel) {
        const reply = await Promise.race([
          kernel.requestKernelInfo().catch(() => undefined),
          delay(READY_ATTEMPT_TIME)
        ]);
        if (reply) {
          return kernel;
        }
      }
      await delay(READY_RETRY_DELAY);
    }
    throw new Error('The Python kernel is not responding.');
  }

  private async _reviveKernel(): Promise<void> {
    try {
      await this._sessionContext.restartKernel();
    } catch {
      await this._sessionContext.changeKernel({
        name: this._sessionContext.kernelPreference.name
      });
    }
  }

  private _sessionContext: ISessionContext;
  private _running: Promise<void> | null = null;
  private _abandon: (() => void) | null = null;
  private _stopRequested = false;
}
