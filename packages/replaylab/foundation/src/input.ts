export type InputContext =
  | 'app'
  | 'court.idle'
  | 'court.actorSelected'
  | 'court.draggingActor'
  | 'court.drawingAction'
  | 'timeline.focused'
  | 'timeline.reordering'
  | 'notes.editing'
  | 'menu'
  | 'modal'
  | 'composing';

export type InputResult = 'ignored' | 'handled' | 'handled-and-prevented';

export class InputCoordinator {
  private contextValue: InputContext = 'app';

  get context() {
    return this.contextValue;
  }

  setContext(context: InputContext) {
    this.contextValue = context;
  }

  shouldSuspendShortcuts(event: KeyboardEvent) {
    if (event.isComposing || this.contextValue === 'composing') return true;
    if (this.contextValue === 'modal' || this.contextValue === 'menu') return true;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], dialog, details[open], [role="dialog"], [role="menu"]'
      )
    );
  }

  handle(
    event: KeyboardEvent,
    commands: {
      addPhase(): void;
      undo(): void;
      redo(): void;
      previousPhase(): void;
      nextPhase(): void;
      selectTool(): void;
      actionTool(type: 'cut' | 'pass' | 'dribble' | 'screen'): void;
    }
  ): InputResult {
    if (this.shouldSuspendShortcuts(event)) return 'ignored';
    if (event.altKey) return 'ignored';
    // Physical shortcut positions remain usable with a Cyrillic keyboard.
    const key = event.key.length === 1 && event.key.charCodeAt(0) > 127 && /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
    const commandModifier = event.metaKey || event.ctrlKey;
    if (commandModifier && key === 'z') {
      if (event.shiftKey) commands.redo();
      else commands.undo();
      event.preventDefault();
      return 'handled-and-prevented';
    }
    if (event.ctrlKey && key === 'y') {
      commands.redo();
      event.preventDefault();
      return 'handled-and-prevented';
    }
    if (commandModifier || event.altKey) return 'ignored';
    if (key === 'f') {
      commands.addPhase();
      event.preventDefault();
      return 'handled-and-prevented';
    }
    if (key === '[') {
      commands.previousPhase();
      event.preventDefault();
      return 'handled-and-prevented';
    }
    if (key === ']') {
      commands.nextPhase();
      event.preventDefault();
      return 'handled-and-prevented';
    }
    if (key === 'v') {
      commands.selectTool();
      return 'handled';
    }
    const actionKey: Partial<Record<string, 'cut' | 'pass' | 'dribble' | 'screen'>> = {
      c: 'cut',
      p: 'pass',
      d: 'dribble',
      s: 'screen',
    };
    if (actionKey[key]) {
      commands.actionTool(actionKey[key]);
      return 'handled';
    }
    return 'ignored';
  }
}
