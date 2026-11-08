import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { WidgetTracker } from '@jupyterlab/apputils';
import { IEditorServices } from '@jupyterlab/codeeditor';
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
  IDocumentWidget
} from '@jupyterlab/docregistry';
import { ILauncher } from '@jupyterlab/launcher';
import { Contents, ServiceManager } from '@jupyterlab/services';
import { fscIcon } from './art';
import { HintService } from './hint';
import { FscPanel } from './panel';

const FACTORY = 'FoxSnakeCode';
const FILE_TYPE = 'fsc';
const CREATE_COMMAND = 'foxsnakecode:create';

class FscWidgetFactory extends ABCWidgetFactory<IDocumentWidget<FscPanel>> {
  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions<IDocumentWidget<FscPanel>>,
    editorServices: IEditorServices,
    serviceManager: ServiceManager.IManager,
    hints: HintService | null
  ) {
    super(options);
    this._editorServices = editorServices;
    this._serviceManager = serviceManager;
    this._hints = hints;
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>
  ): IDocumentWidget<FscPanel> {
    const content = new FscPanel({
      context,
      editorServices: this._editorServices,
      serviceManager: this._serviceManager,
      hints: this._hints
    });
    const widget = new DocumentWidget({ content, context });
    widget.toolbar.hide();
    return widget;
  }

  private _editorServices: IEditorServices;
  private _serviceManager: ServiceManager.IManager;
  private _hints: HintService | null;
}

async function loadHints(app: JupyterFrontEnd): Promise<HintService | null> {
  try {
    const ai = await import('@jupyter-ai/jupyternaut-lite');
    const [factory, settings, providers] = await Promise.all([
      app.resolveOptionalService(ai.IAgentManagerFactory),
      app.resolveOptionalService(ai.IAISettingsModel),
      app.resolveOptionalService(ai.IProviderRegistry)
    ]);
    if (!factory || !settings || !providers) {
      return null;
    }
    return new HintService(factory, settings, providers, () => {
      void app.commands.execute(ai.CommandIds.openSettings);
    });
  } catch {
    return null;
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'foxsnakecode:plugin',
  description: 'Open .fsc coding puzzles in a split code and game panel.',
  autoStart: true,
  requires: [IEditorServices],
  optional: [ILayoutRestorer, ILauncher],
  activate: async (
    app: JupyterFrontEnd,
    editorServices: IEditorServices,
    restorer: ILayoutRestorer | null,
    launcher: ILauncher | null
  ) => {
    const hints = await loadHints(app);

    app.docRegistry.addFileType({
      name: FILE_TYPE,
      displayName: 'FoxSnakeCode Mission',
      extensions: ['.fsc'],
      mimeTypes: ['application/json'],
      fileFormat: 'text',
      contentType: 'file',
      icon: fscIcon
    });

    const factory = new FscWidgetFactory(
      {
        name: FACTORY,
        modelName: 'text',
        fileTypes: [FILE_TYPE],
        defaultFor: [FILE_TYPE]
      },
      editorServices,
      app.serviceManager,
      hints
    );

    const tracker = new WidgetTracker<IDocumentWidget<FscPanel>>({
      namespace: 'foxsnakecode'
    });
    if (restorer) {
      void restorer.restore(tracker, {
        command: 'docmanager:open',
        args: widget => ({ path: widget.context.path, factory: FACTORY }),
        name: widget => widget.context.path
      });
    }
    factory.widgetCreated.connect((_, widget) => {
      widget.title.icon = fscIcon;
      widget.context.pathChanged.connect(() => {
        void tracker.save(widget);
      });
      void tracker.add(widget);
    });
    app.docRegistry.addWidgetFactory(factory);

    app.commands.addCommand(CREATE_COMMAND, {
      label: 'FoxSnakeCode',
      caption: 'Start a new FoxSnakeCode game',
      icon: fscIcon,
      execute: async args => {
        const model: Contents.IModel = await app.commands.execute(
          'docmanager:new-untitled',
          { path: (args.cwd as string) ?? '', type: 'file', ext: '.fsc' }
        );
        return app.commands.execute('docmanager:open', {
          path: model.path,
          factory: FACTORY
        });
      }
    });
    launcher?.add({ command: CREATE_COMMAND, category: 'Other' });
  }
};

export default plugin;
