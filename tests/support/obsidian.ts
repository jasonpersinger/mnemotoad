/** Independent contract mock, not an Obsidian emulator or legacy-derived shim. */
export class Component {
  private cleanup: (() => void)[] = [];
  register(fn: () => void): void { this.cleanup.push(fn); }
  protected clean(): void { for (const fn of this.cleanup.splice(0).reverse()) fn(); }
}
export class TFile { constructor(public path: string) {} }
export class TFolder { constructor(public path: string) {} }
export const normalizePath = (path: string): string => path;
export class Notice { static messages: string[] = []; constructor(text: string) { Notice.messages.push(text); } }
export class Modal {
  contentEl = document.createElement('div');
  constructor(public app: unknown) {}
  onOpen(): void {}
  onClose(): void {}
  open(): void { this.onOpen(); }
  close(): void { this.onClose(); }
}
export class Scope {
  handlers = new Set<{ modifiers: unknown; key: unknown; callback: () => boolean }>();
  constructor(readonly parent?: Scope) {}
  register(modifiers: unknown, key: unknown, callback: () => boolean) { const handler = { modifiers, key, callback }; this.handlers.add(handler); return handler; }
  unregister(handler: { modifiers: unknown; key: unknown; callback: () => boolean }): void { this.handlers.delete(handler); }
}
export class ItemView extends Component {
  app = { scope: new Scope(), workspace: { requestSaveLayout: () => {} } };
  contentEl = document.createElement('div');
  constructor(public leaf: unknown) { super(); }
}
export class Plugin extends Component {
  views = new Map<string, (leaf: unknown) => unknown>();
  commands: { id: string; checkCallback: (checking: boolean) => boolean }[] = [];
  tabs: unknown[] = [];
  savedData: unknown = null;
  constructor(public app: unknown) { super(); }
  async loadData(): Promise<unknown> { return structuredClone(this.savedData); }
  async saveData(value: unknown): Promise<void> { this.savedData = structuredClone(value); }
  registerView(type: string, factory: (leaf: unknown) => unknown): void {
    if (this.views.has(type)) throw Error('Duplicate view registration');
    this.views.set(type, factory); this.register(() => { this.views.delete(type); });
  }
  addCommand(command: { id: string; checkCallback: (checking: boolean) => boolean }): void {
    if (this.commands.some(c => c.id === command.id)) throw Error('Duplicate command registration');
    this.commands.push(command); this.register(() => { this.commands = this.commands.filter(c => c !== command); });
  }
  addSettingTab(tab: unknown): void { this.tabs.push(tab); this.register(() => { this.tabs = this.tabs.filter(t => t !== tab); }); }
  unload(): void {
    if ('onunload' in this && typeof this.onunload === 'function') this.onunload();
    this.clean();
  }
}
export class PluginSettingTab {
  containerEl = document.createElement('div');
  constructor(public app: unknown, public plugin: unknown) { /* Public shape only. */ }
}
class Toggle {
  value = false;
  disabled = false;
  callback?: (value: boolean) => void;
  setValue(value: boolean): this { this.value = value; return this; }
  setDisabled(value: boolean): this { this.disabled = value; return this; }
  onChange(callback: (value: boolean) => void): this { this.callback = callback; return this; }
}
export class Setting {
  name = ''; description = '';
  constructor(public container: HTMLElement) {}
  setName(text: string): this { this.name = text; return this; }
  setDesc(text: string): this { this.description = text; return this; }
  addToggle(callback: (toggle: Toggle) => unknown): this { callback(new Toggle()); return this; }
}

export function installDomHelpers(): void {
  Object.defineProperties(HTMLElement.prototype, {
    scrollIntoView: { configurable: true, value() {} },
    empty: { configurable: true, value(this: HTMLElement) { this.replaceChildren(); } },
    addClass: { configurable: true, value(this: HTMLElement, name: string) { this.classList.add(name); } },
    setText: { configurable: true, value(this: HTMLElement, text: string) { this.textContent = text; } },
    createEl: { configurable: true, value(this: HTMLElement, tag: string, options: { text?: string; cls?: string; attr?: Record<string,string> } = {}) {
      const node = document.createElement(tag); node.textContent = options.text ?? '';
      if (options.cls) node.className = options.cls;
      for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, value);
      this.append(node); return node;
    } },
  });
}
