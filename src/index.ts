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
import {
  CommandIds,
  IAgentManagerFactory,
  IAISettingsModel,
  IProviderRegistry
} from '@jupyter-ai/jupyternaut-lite';
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

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'foxsnakecode:plugin',
  description: 'Open .fsc coding puzzles in a split code and game panel.',
  autoStart: true,
  requires: [IEditorServices],
  optional: [
    ILayoutRestorer,
    ILauncher,
    IAgentManagerFactory,
    IAISettingsModel,
    IProviderRegistry
  ],
  activate: (
    app: JupyterFrontEnd,
    editorServices: IEditorServices,
    restorer: ILayoutRestorer | null,
    launcher: ILauncher | null,
    agentFactory: IAgentManagerFactory | null,
    aiSettings: IAISettingsModel | null,
    aiProviders: IProviderRegistry | null
  ) => {
    const hints =
      agentFactory && aiSettings && aiProviders
        ? new HintService(agentFactory, aiSettings, aiProviders, () => {
            void app.commands.execute(CommandIds.openSettings);
          })
        : null;

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
