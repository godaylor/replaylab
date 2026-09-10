export type RichCueBlockType = 'paragraph' | 'bullet' | 'number';

export type RichCueRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  link?: string;
};

export type RichCueBlock = {
  type: RichCueBlockType;
  runs: RichCueRun[];
};

export type RichCueDocument = {
  blocks: RichCueBlock[];
};

export type RichCueDelta = {
  insert: string;
  attributes?: Record<string, unknown>;
};

const ALLOWED_BLOCKS = new Set<RichCueBlockType>([
  'paragraph',
  'bullet',
  'number',
]);

function normalizeLink(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRun(run: RichCueRun): RichCueRun {
  const link = normalizeLink(run.link);
  return {
    text: run.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
    ...(run.bold ? { bold: true } : {}),
    ...(run.italic ? { italic: true } : {}),
    ...(run.underline ? { underline: true } : {}),
    ...(link ? { link } : {}),
  };
}

export function validateRichCueDocument(input: RichCueDocument) {
  if (!input || !Array.isArray(input.blocks)) {
    throw new Error('Cue must contain paragraph or list blocks');
  }
  if (input.blocks.length === 0 || input.blocks.length > 40) {
    throw new Error('Cue must contain 1–40 paragraph or list blocks');
  }
  const normalized: RichCueDocument = {
    blocks: input.blocks.map(block => {
      if (!ALLOWED_BLOCKS.has(block.type) || !Array.isArray(block.runs)) {
        throw new Error('Cue contains an unsupported block');
      }
      return {
        type: block.type,
        runs: block.runs.map(run => {
          if (!run || typeof run.text !== 'string') {
            throw new Error('Cue contains invalid inline text');
          }
          if (run.link && !normalizeLink(run.link)) {
            throw new Error('Cue links must use http or https');
          }
          return normalizeRun(run);
        }),
      };
    }),
  };
  if (richCuePlainText(normalized).length > 2000) {
    throw new Error('Cue must contain at most 2000 characters');
  }
  return normalized;
}

export function richCuePlainText(document: RichCueDocument) {
  return document.blocks
    .map(block => block.runs.map(run => run.text).join(''))
    .join('\n');
}

export function richCueToDelta(input: RichCueDocument): RichCueDelta[] {
  const document = validateRichCueDocument(input);
  const delta: RichCueDelta[] = [];
  for (const block of document.blocks) {
    for (const run of block.runs) {
      if (!run.text) continue;
      const attributes: Record<string, unknown> = {};
      if (run.bold) attributes.bold = true;
      if (run.italic) attributes.italic = true;
      if (run.underline) attributes.underline = true;
      if (run.link) attributes.link = run.link;
      delta.push({
        insert: run.text,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      });
    }
    delta.push({ insert: '\n', attributes: { block: block.type } });
  }
  return delta;
}

export function richCueFromDelta(delta: RichCueDelta[]): RichCueDocument {
  const blocks: RichCueBlock[] = [];
  let runs: RichCueRun[] = [];

  const appendText = (value: string, attributes?: Record<string, unknown>) => {
    if (!value) return;
    const run: RichCueRun = {
      text: value,
      ...(attributes?.bold === true ? { bold: true } : {}),
      ...(attributes?.italic === true ? { italic: true } : {}),
      ...(attributes?.underline === true ? { underline: true } : {}),
    };
    const link = normalizeLink(attributes?.link);
    if (link) run.link = link;
    runs.push(run);
  };

  const closeBlock = (type: unknown) => {
    blocks.push({
      type: ALLOWED_BLOCKS.has(type as RichCueBlockType)
        ? (type as RichCueBlockType)
        : 'paragraph',
      runs: runs.length > 0 ? runs : [{ text: '' }],
    });
    runs = [];
  };

  for (const operation of delta) {
    if (typeof operation.insert !== 'string') continue;
    const pieces = operation.insert.split('\n');
    pieces.forEach((piece, index) => {
      appendText(piece, operation.attributes);
      if (index < pieces.length - 1) closeBlock(operation.attributes?.block);
    });
  }
  if (runs.length > 0 || blocks.length === 0) closeBlock('paragraph');
  return validateRichCueDocument({ blocks });
}

export function plainTextCue(value: string): RichCueDocument {
  const lines = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  return validateRichCueDocument({
    blocks: lines.map(text => ({ type: 'paragraph', runs: [{ text }] })),
  });
}
