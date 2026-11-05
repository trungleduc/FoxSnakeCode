import { ISessionContext } from '@jupyterlab/apputils';
import { KernelMessage } from '@jupyterlab/services';
import { buildRunCode, IRunResult, readRunOutput } from './engine';
import { IScene } from './format';

const STOP_TIMEOUT = 2000;

export class Runner {
  constructor(sessionContext: ISessionContext) {
    this._sessionContext = sessionContext;
  }

  async run(scene: IScene, code: string): Promise<IRunResult> {
    const kernel = this._sessionContext.session?.kernel;
    if (!kernel) {
      throw new Error('No Python kernel is running.');
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
    this._stopRequested = false;
    const abandoned = new Promise<void>(resolve => {
      this._abandon = resolve;
    });
    let finished: () => void = () => undefined;
    this._running = new Promise<void>(resolve => {
      finished = resolve;
    });
    try {
      await Promise.race([future.done, abandoned]);
    } catch (error) {
      kernelError = kernelError || (error as Error).message;
    }
    future.dispose();
    this._abandon = null;
    window.clearTimeout(this._stopTimer);
    finished();
    this._running = null;

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

  async stop(): Promise<void> {
    const running = this._running;
    const kernel = this._sessionContext.session?.kernel;
    if (!running || !kernel) {
      return;
    }
    this._stopRequested = true;
    this._stopTimer = window.setTimeout(() => {
      const abandon = this._abandon;
      void this._sessionContext
        .restartKernel()
        .catch(() => undefined)
        .then(() => abandon?.());
    }, STOP_TIMEOUT);
    kernel.interrupt().catch(() => undefined);
    await running;
  }

  private _sessionContext: ISessionContext;
  private _running: Promise<void> | null = null;
  private _abandon: (() => void) | null = null;
  private _stopRequested = false;
  private _stopTimer = 0;
}
