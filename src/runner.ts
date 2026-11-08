import { ISessionContext } from '@jupyterlab/apputils';
import { Kernel, KernelMessage } from '@jupyterlab/services';
import {
  buildLoadCode,
  buildRunCode,
  IRunResult,
  readMissionsOutput,
  readRunOutput
} from './engine';
import { IScene } from './format';

const READY_TIMEOUT = 60000;
const READY_ATTEMPT_TIME = 1000;
const READY_RETRY_DELAY = 200;

function delay(time: number): Promise<undefined> {
  return new Promise(resolve => {
    window.setTimeout(() => resolve(undefined), time);
  });
}

export class Runner {
  constructor(sessionContext: ISessionContext, kernelManager: Kernel.IManager) {
    this._sessionContext = sessionContext;
    this._kernelManager = kernelManager;
  }

  async loadMissions(): Promise<string> {
    const kernel = await this._readyKernel();
    const { stdout, kernelError } = await this._collect(
      kernel,
      buildLoadCode(),
      new Promise<void>(() => undefined)
    );
    const missions = readMissionsOutput(stdout);
    if (missions === null) {
      throw new Error(kernelError || 'The kernel did not return the missions.');
    }
    return missions;
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
    const { stdout, stderr, kernelError } = await this._collect(
      kernel,
      buildRunCode(scene, code),
      abandoned
    );

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

  private async _collect(
    kernel: Kernel.IKernelConnection,
    code: string,
    abandoned: Promise<void>
  ): Promise<{ stdout: string; stderr: string; kernelError: string }> {
    let stdout = '';
    let stderr = '';
    let kernelError = '';
    const future = kernel.requestExecute({
      code,
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
    return { stdout, stderr, kernelError };
  }

  private async _readyKernel(): Promise<Kernel.IKernelConnection> {
    const deadline = Date.now() + READY_TIMEOUT;
    while (Date.now() < deadline && !this._stopRequested) {
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
      if (await this._kernelIsGone(kernel)) {
        await this._reviveKernel();
      }
      await delay(READY_RETRY_DELAY);
    }
    throw new Error('The Python kernel is not responding.');
  }

  private async _kernelIsGone(
    kernel: Kernel.IKernelConnection | null | undefined
  ): Promise<boolean> {
    if (!kernel || kernel.status === 'dead') {
      return true;
    }
    const model = await this._kernelManager
      .findById(kernel.id)
      .catch(() => kernel.model);
    return !model;
  }

  private async _reviveKernel(): Promise<void> {
    await this._sessionContext.shutdown().catch(() => undefined);
    await this._sessionContext
      .changeKernel({ name: this._sessionContext.kernelPreference.name })
      .catch(() => undefined);
  }

  private _sessionContext: ISessionContext;
  private _kernelManager: Kernel.IManager;
  private _running: Promise<void> | null = null;
  private _abandon: (() => void) | null = null;
  private _stopRequested = false;
}
