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
import { ServiceManager } from '@jupyterlab/services';
import { fscIcon } from './art';
import { FscPanel } from './panel';

const FACTORY = 'FoxSnakeCode';
const FILE_TYPE = 'fsc';

class FscWidgetFactory extends ABCWidgetFactory<IDocumentWidget<FscPanel>> {
  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions<IDocumentWidget<FscPanel>>,
    editorServices: IEditorServices,
    serviceManager: ServiceManager.IManager
  ) {
    super(options);
    this._editorServices = editorServices;
    this._serviceManager = serviceManager;
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>
  ): IDocumentWidget<FscPanel> {
    const content = new FscPanel({
      context,
      editorServices: this._editorServices,
      serviceManager: this._serviceManager
    });
    const widget = new DocumentWidget({ content, context });
    widget.toolbar.hide();
    return widget;
  }

  private _editorServices: IEditorServices;
  private _serviceManager: ServiceManager.IManager;
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'foxsnakecode:plugin',
  description: 'Open .fsc coding puzzles in a split code and game panel.',
  autoStart: true,
  requires: [IEditorServices],
  optional: [ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    editorServices: IEditorServices,
    restorer: ILayoutRestorer | null
  ) => {
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
      app.serviceManager
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
  }
};

export default plugin;
