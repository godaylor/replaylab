import { NoopLogger } from '@blocksuite/global/utils';
import type {
  Doc,
  DocMeta,
  DocsPropertiesMeta,
  GetStoreOptions,
  RemoveStoreOptions,
  Workspace,
  WorkspaceMeta,
  YBlock,
} from '@blocksuite/store';
import { AwarenessStore, StoreContainer } from '@blocksuite/store';
import { BlobEngine, MemoryBlobSource } from '@blocksuite/sync';
import { Subject } from 'rxjs';
import { Awareness } from 'y-protocols/awareness.js';
import type * as Y from 'yjs';

import { replayLabSchemaExtensions } from './schema';

class ReplayLabMeta implements WorkspaceMeta {
  private readonly metas: DocMeta[];
  private propertiesValue: DocsPropertiesMeta = { tags: { options: [] } };
  readonly docMetaAdded = new Subject<string>();
  readonly docMetaRemoved = new Subject<string>();
  readonly docMetaUpdated = new Subject<void>();

  constructor(docId: string) {
    this.metas = [{ id: docId, title: 'Slice 0 play', tags: [], createDate: 0 }];
  }

  get docMetas() { return this.metas; }
  get docs() { return this.metas; }
  get properties() { return this.propertiesValue; }
  initialize() {}
  addDocMeta(meta: DocMeta) { this.metas.push(meta); this.docMetaAdded.next(meta.id); }
  getDocMeta(id: string) { return this.metas.find(meta => meta.id === id); }
  setDocMeta(id: string, props: Partial<DocMeta>) {
    const meta = this.getDocMeta(id);
    if (meta) Object.assign(meta, props);
    this.docMetaUpdated.next();
  }
  removeDocMeta(id: string) {
    const index = this.metas.findIndex(meta => meta.id === id);
    if (index >= 0) this.metas.splice(index, 1);
    this.docMetaRemoved.next(id);
  }
  setProperties(meta: DocsPropertiesMeta) { this.propertiesValue = meta; }
}

class ReplayLabWorkspace implements Workspace {
  readonly id: string;
  readonly meta: WorkspaceMeta;
  readonly idGenerator = () => crypto.randomUUID();
  readonly blobSync = new BlobEngine(new MemoryBlobSource(), [], new NoopLogger());
  readonly docs = new Map<string, Doc>();
  readonly slots = { docListUpdated: new Subject<void>() };

  constructor(readonly doc: Y.Doc, docId: string) {
    this.id = `replaylab:${docId}`;
    this.meta = new ReplayLabMeta(docId);
  }

  createDoc(): Doc { throw new Error('Slice 0 workspace owns exactly one document'); }
  getDoc(docId: string) { return this.docs.get(docId) ?? null; }
  removeDoc(): void { throw new Error('Slice 0 does not delete documents'); }
  dispose() { this.blobSync.stop(); }
}

export class ReplayLabDoc implements Doc {
  private readonly container: StoreContainer;
  readonly awarenessStore: AwarenessStore;
  readonly workspace: ReplayLabWorkspace;
  readonly yBlocks: Y.Map<YBlock>;
  readonly loaded = true;
  readonly ready = true;

  constructor(readonly rootDoc: Y.Doc, readonly id: string) {
    this.workspace = new ReplayLabWorkspace(rootDoc, id);
    this.workspace.docs.set(id, this);
    this.awarenessStore = new AwarenessStore(new Awareness(rootDoc));
    this.yBlocks = rootDoc.getMap<YBlock>('blocks');
    this.container = new StoreContainer(this);
  }

  get spaceDoc() { return this.rootDoc; }
  get meta() { return this.workspace.meta.getDocMeta(this.id); }
  clear() { this.yBlocks.clear(); }
  dispose() { this.awarenessStore.destroy(); this.workspace.dispose(); }
  load(initFn?: () => void) { initFn?.(); }
  remove() { throw new Error('Slice 0 does not delete documents'); }
  getStore(options: GetStoreOptions = {}) {
    return this.container.getStore({
      ...options,
      id: options.id ?? this.id,
      extensions: [...replayLabSchemaExtensions, ...(options.extensions ?? [])],
    });
  }
  removeStore(options: RemoveStoreOptions) { this.container.removeStore(options); }
}
