import { useEffect, useState } from 'react';
import type { EmergencyJournal } from './emergency-journal';

import type {
  RichCueBlock,
  RichCueBlockType,
  RichCueDocument,
  RichCueRun,
} from './cue';
import type { InputCoordinator } from './input';
import { useI18n } from './i18n';

type Props = {
  phaseId: string;
  document: RichCueDocument;
  readOnly: boolean;
  coordinator: InputCoordinator;
  journal?: EmergencyJournal;
  titleDraft?: string;
  onCommit(document: RichCueDocument): boolean | undefined;
  onAnnounce(message: string): void;
};

function clone(document: RichCueDocument): RichCueDocument {
  return {
    blocks: document.blocks.map(block => ({
      type: block.type,
      runs: block.runs.map(run => ({ ...run })),
    })),
  };
}

function blockText(block: RichCueBlock) {
  return block.runs.map(run => run.text).join('');
}

function replaceBlockRun(block: RichCueBlock, change: Partial<RichCueRun>) {
  const current = block.runs[0] ?? { text: '' };
  return { ...current, text: blockText(block), ...change };
}

export function RichCueEditor(props: Props) {
  const { t } = useI18n();
  const [retained, setRetained] = useState(() => {
    try { return props.journal?.scan().entries.filter(entry => entry.body.kind === 'draft' && entry.body.entity === props.phaseId) ?? []; }
    catch { return []; }
  });
  const recovered = retained.filter(entry => !retained.some(other => other.body.session === entry.body.session && other.body.sequence > entry.body.sequence));
  const [selectedRecovery, setSelectedRecovery] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [draft, setDraft] = useState(() => clone(props.document));

  const canonicalCue = JSON.stringify(props.document);
  // Parent status/pose renders create a fresh projection object. Only an actual
  // cue change or phase switch may replace this local, unapplied input draft.
  useEffect(() => { if (!dirty) setDraft(JSON.parse(canonicalCue) as RichCueDocument); }, [canonicalCue, dirty]);

  const persistDraft = (next: RichCueDocument) => {
    try { props.journal?.write('draft', props.phaseId, JSON.stringify(next)); setDraftError(false); }
    catch { setDraftError(true); props.onAnnounce(t('draftStorageFailed')); }
    setDirty(true);
    setDraft(next);
  };
  const discardSelected = () => {
    if (!props.journal) return;
    for (const entry of [...retained.filter(entry => entry.body.session === selectedRecovery), ...props.journal.scan().entries.filter(entry => entry.body.session === props.journal!.session && entry.body.kind === 'draft' && entry.body.entity === props.phaseId)]) props.journal.removeUnchanged(entry);
    setSelectedRecovery(null);
    setRetained(current => current.filter(entry => entry.body.session !== selectedRecovery));
  };
  const recover = (session: string, payload: string) => {
    try {
      const value = JSON.parse(payload) as RichCueDocument;
      if (!Array.isArray(value.blocks) || !value.blocks.length || value.blocks.length > 40 || value.blocks.some(block => !['paragraph', 'bullet', 'number'].includes(block.type) || !Array.isArray(block.runs) || block.runs.some(run => typeof run.text !== 'string' || (run.link !== undefined && typeof run.link !== 'string')))) throw new Error('Invalid draft');
      setSelectedRecovery(session);
      persistDraft(value);
      props.onAnnounce(t('draftRestored'));
    } catch { setDraftError(true); }
  };

  const updateBlock = (index: number, next: RichCueBlock) => {
    persistDraft({
      blocks: draft.blocks.map((block, blockIndex) =>
        blockIndex === index ? next : block
      ),
    });
  };

  const toggle = (index: number, key: 'bold' | 'italic' | 'underline') => {
    const block = draft.blocks[index]!;
    const run = block.runs[0] ?? { text: '' };
    updateBlock(index, {
      ...block,
      runs: [replaceBlockRun(block, { [key]: !run[key] })],
    });
  };

  const reset = () => {
    try { discardSelected(); } catch { setDraftError(true); return; }
    setDirty(false);
    setDraft(clone(props.document));
    props.onAnnounce(t('cueChangesCancelled'));
  };

  return (
    <section className="cue-editor" aria-labelledby="cue-heading" data-focus-target="cue">
      {recovered.map((entry, index) => <button key={entry.key} type="button" disabled={props.readOnly} onClick={() => recover(entry.body.session, entry.body.payload)}>{t('restoreDraft', { number: index + 1 })}</button>)}
      {dirty ? <p role="status">{t('draftPending')}</p> : null}
      {draftError ? <p role="alert">{t('draftStorageFailed')}</p> : null}
      <button type="button" onClick={() => {
        let emergency: string | undefined;
        try { emergency = props.journal?.exportRaw(); } catch { setDraftError(true); }
        const blob = new Blob([JSON.stringify({ format: 'replaylab-draft-export', version: 1, phaseId: props.phaseId, draft, titleDraft: props.titleDraft, emergency })], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'replaylab-drafts.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>{t('exportDrafts')}</button>
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">{t('phaseInstruction')}</span>
          <h2 id="cue-heading">{t('cue')}</h2>
        </div>
        <span className="entity-count">{t('richText')}</span>
      </div>
      <div className="cue-blocks">
        {draft.blocks.map((block, index) => {
          const run = block.runs[0] ?? { text: '' };
          return (
            <fieldset className="cue-block" key={`${props.phaseId}:${index}`}>
              <legend>{t('cueBlock', { number: index + 1 })}</legend>
              <label>
                <span>{t('cueBlockType')}</span>
                <select
                  aria-label={t('cueBlockTypeLabel', { number: index + 1 })}
                  value={block.type}
                  disabled={props.readOnly}
                  onChange={event =>
                    updateBlock(index, {
                      ...block,
                      type: event.target.value as RichCueBlockType,
                    })
                  }
                >
                  <option value="paragraph">{t('paragraph')}</option>
                  <option value="bullet">{t('bullet')}</option>
                  <option value="number">{t('numbered')}</option>
                </select>
              </label>
              <div className="cue-formatting" aria-label={t('cueFormatting', { number: index + 1 })}>
                {(['bold', 'italic', 'underline'] as const).map(format => (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={Boolean(run[format])}
                    disabled={props.readOnly}
                    onClick={() => toggle(index, format)}
                  >
                    {t(format)}
                  </button>
                ))}
              </div>
              <textarea
                aria-label={t('cueText', { number: index + 1 })}
                value={blockText(block)}
                maxLength={2000}
                readOnly={props.readOnly}
                onFocus={() => props.coordinator.setContext('notes.editing')}
                onCompositionStart={() => props.coordinator.setContext('composing')}
                onCompositionEnd={() => props.coordinator.setContext('notes.editing')}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    reset();
                  }
                }}
                onChange={event =>
                  updateBlock(index, {
                    ...block,
                    runs: [replaceBlockRun(block, { text: event.target.value })],
                  })
                }
              />
              <label>
                <span>{t('linkOptional')}</span>
                <input
                  aria-label={t('cueLink', { number: index + 1 })}
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  value={run.link ?? ''}
                  readOnly={props.readOnly}
                  onChange={event =>
                    updateBlock(index, {
                      ...block,
                      runs: [
                        replaceBlockRun(block, {
                          link: event.target.value || undefined,
                        }),
                      ],
                    })
                  }
                />
              </label>
              <button
                type="button"
                disabled={props.readOnly || draft.blocks.length === 1}
                onClick={() =>
                  persistDraft({ blocks: draft.blocks.filter((_, blockIndex) => blockIndex !== index) })
                }
              >
                {t('removeBlock')}
              </button>
            </fieldset>
          );
        })}
      </div>
      <div className="cue-actions">
        <button
          type="button"
          disabled={props.readOnly || draft.blocks.length >= 40}
          onClick={() =>
            persistDraft({ blocks: [...draft.blocks, { type: 'paragraph', runs: [{ text: '' }] }] })
          }
        >
          {t('addCueBlock')}
        </button>
        <button type="button" disabled={props.readOnly} onClick={reset}>
          {t('cancelCueChanges')}
        </button>
        <button
          className="button button-accent"
          type="button"
          disabled={props.readOnly}
          onClick={() => { if (props.onCommit(draft)) { try { discardSelected(); setDirty(false); } catch { setDraftError(true); } } }}
        >
          {t('applyCue')}
        </button>
      </div>
      <div className="cue-preview" aria-label={t('cuePreview')}>
        {draft.blocks.map((block, index) => {
          const Tag = block.type === 'paragraph' ? 'p' : 'li';
          return (
            <Tag key={index} data-block-type={block.type}>
              {block.runs.map((item, runIndex) => {
                let content = <>{item.text}</>;
                if (item.bold) content = <strong>{content}</strong>;
                if (item.italic) content = <em>{content}</em>;
                if (item.underline) content = <u>{content}</u>;
                return item.link && /^https?:\/\//i.test(item.link) ? (
                  <a key={runIndex} href={item.link} rel="noreferrer" target="_blank">{content}</a>
                ) : (
                  <span key={runIndex}>{content}</span>
                );
              })}
            </Tag>
          );
        })}
      </div>
    </section>
  );
}
