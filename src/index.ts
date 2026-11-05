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
import { cgsIcon } from './art';
import { CgsPanel } from './panel';

const FACTORY = 'Code Gear Solid';
const FILE_TYPE = 'cgs';

class CgsWidgetFactory extends ABCWidgetFactory<IDocumentWidget<CgsPanel>> {
  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions<IDocumentWidget<CgsPanel>>,
    editorServices: IEditorServices,
    serviceManager: ServiceManager.IManager
  ) {
    super(options);
    this._editorServices = editorServices;
    this._serviceManager = serviceManager;
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>
  ): IDocumentWidget<CgsPanel> {
    const content = new CgsPanel({
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
  id: 'jupyterlab-code-gear-solid:plugin',
  description: 'Open .cgs coding puzzles in a split code and game panel.',
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
      displayName: 'Code Gear Solid Mission',
      extensions: ['.cgs'],
      mimeTypes: ['application/json'],
      fileFormat: 'text',
      contentType: 'file',
      icon: cgsIcon
    });

    const factory = new CgsWidgetFactory(
      {
        name: FACTORY,
        modelName: 'text',
        fileTypes: [FILE_TYPE],
        defaultFor: [FILE_TYPE]
      },
      editorServices,
      app.serviceManager
    );

    const tracker = new WidgetTracker<IDocumentWidget<CgsPanel>>({
      namespace: 'code-gear-solid'
    });
    if (restorer) {
      void restorer.restore(tracker, {
        command: 'docmanager:open',
        args: widget => ({ path: widget.context.path, factory: FACTORY }),
        name: widget => widget.context.path
      });
    }
    factory.widgetCreated.connect((_, widget) => {
      widget.title.icon = cgsIcon;
      widget.context.pathChanged.connect(() => {
        void tracker.save(widget);
      });
      void tracker.add(widget);
    });
    app.docRegistry.addWidgetFactory(factory);
  }
};

export default plugin;
