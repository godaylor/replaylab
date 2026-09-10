import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';
import { SurfaceBlockModel } from '@blocksuite/std/gfx';
import * as Y from 'yjs';

export * from './domain';
export * from './cue';

export const RootBlockSchema = defineBlockSchema({
  flavour: 'replaylab:page',
  props: internal => ({ title: internal.Text() }),
  metadata: {
    version: 1,
    role: 'root',
    children: ['replaylab:surface', 'replaylab:cue'],
  },
});

export const CueBlockSchema = defineBlockSchema({
  flavour: 'replaylab:cue',
  props: internal => ({ phaseId: '', text: internal.Text() }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['replaylab:page'],
  },
});

export const SurfaceBlockSchema = defineBlockSchema({
  flavour: 'replaylab:surface',
  props: internal => ({
    elements: internal.Boxed<Y.Map<Y.Map<unknown>>>(new Y.Map()),
  }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: ['replaylab:page'],
  },
  toModel: () => new SurfaceBlockModel(),
});

export class RootBlockModel extends BlockModel<
  ReturnType<(typeof RootBlockSchema)['model']['props']>
> {}

export class CueBlockModel extends BlockModel<
  ReturnType<(typeof CueBlockSchema)['model']['props']>
> {}

export const replayLabSchemaExtensions = [
  BlockSchemaExtension(RootBlockSchema),
  BlockSchemaExtension(CueBlockSchema),
  BlockSchemaExtension(SurfaceBlockSchema),
];
