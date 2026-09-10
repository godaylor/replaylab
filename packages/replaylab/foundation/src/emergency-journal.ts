// Original ReplayLab recovery format. No network credentials or awareness.
// Checksums detect accidental damage; they are not an authentication boundary.
export const JOURNAL_VERSION = 1;
const MAX_RECORD = 2_000_000;
type RecordBody = { version: number; session: string; sequence: number; kind: 'document' | 'draft'; entity: string; payload: string };
type Entry = { key: string; raw: string; body: RecordBody };
function checksum(text: string) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return (value >>> 0).toString(16).padStart(8, '0');
}
export function journalPrefix(database: string, playId: string) {
  return `replaylab:emergency:${encodeURIComponent(database)}:${encodeURIComponent(playId)}:`;
}
export class EmergencyJournal {
  readonly session = crypto.randomUUID();
  readonly prefix: string;
  sequence = 0;
  private readonly draftSequences = new Map<string, number>();
  error: Error | null = null;
  constructor(database: string, playId: string) { this.prefix = journalPrefix(database, playId); }
  scan() {
    const entries: Entry[] = [];
    const damaged: string[] = [];
    const latest = new Map<string, Entry>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(this.prefix + 'record:')) continue;
      const raw = localStorage.getItem(key)!;
      try {
        if (raw.length > MAX_RECORD) throw new Error('Oversized journal record');
        const envelope = JSON.parse(raw);
        const body: RecordBody = JSON.parse(envelope.body);
        if (checksum(envelope.body) !== envelope.checksum || body.version !== JOURNAL_VERSION || !Number.isSafeInteger(body.sequence) || body.sequence < 1 || typeof body.session !== 'string' || typeof body.entity !== 'string' || typeof body.payload !== 'string' || !['document', 'draft'].includes(body.kind)) throw new Error('Invalid journal record');
        if (key !== this.recordKey(body.session, body.kind, body.entity, body.sequence)) throw new Error('Journal identity mismatch');
        const entry = { key, raw, body };
        if (body.kind === 'draft' && localStorage.getItem(this.prefix + 'dismissed:' + checksum(raw)) === raw) continue;
        entries.push(entry);
        const id = JSON.stringify([body.session, body.kind, body.entity]);
        if ((latest.get(id)?.body.sequence ?? 0) < body.sequence) latest.set(id, entry);
      } catch { damaged.push(key); }
    }
    return { entries, latest: [...latest.values()], damaged };
  }
  private recordKey(session: string, kind: string, entity: string, sequence: number) {
    return `${this.prefix}record:${session}:${kind}:${encodeURIComponent(entity)}:${sequence % 2}`;
  }
  write(kind: 'document' | 'draft', entity: string, payload: string) {
    const sequence = kind === 'document' ? ++this.sequence : (this.draftSequences.get(entity) ?? 0) + 1;
    if (kind === 'draft') this.draftSequences.set(entity, sequence);
    const body: RecordBody = { version: JOURNAL_VERSION, session: this.session, sequence, kind, entity, payload };
    const serialized = JSON.stringify(body);
    const raw = JSON.stringify({ body: serialized, checksum: checksum(serialized) });
    if (raw.length > MAX_RECORD) throw new Error('Emergency journal quota: record exceeds safe limit; export current work');
    localStorage.setItem(this.recordKey(this.session, kind, entity, body.sequence), raw);
    return body.sequence;
  }
  capture(update: Uint8Array) {
    try { this.write('document', '', encodeUpdate(update)); this.error = null; }
    catch (error) { this.error = error instanceof Error ? error : new Error(String(error)); }
  }
  acknowledge(sequence: number) {
    // Only this writer's acknowledged document slots, never another tab/draft.
    for (const entry of this.scan().entries) if (entry.body.session === this.session && entry.body.kind === 'document' && entry.body.sequence <= sequence) this.removeUnchanged(entry);
  }
  removeUnchanged(entry: Entry) {
    if (entry.body.session === this.session) {
      if (localStorage.getItem(entry.key) === entry.raw) localStorage.removeItem(entry.key);
    } else if (entry.body.kind === 'draft') {
      // Immutable observed-value dismissal: never delete another active writer's
      // slot. The raw value is also retained here, including on hash collision.
      localStorage.setItem(this.prefix + 'dismissed:' + checksum(entry.raw), entry.raw);
    }
  }
  exportRaw() {
    const records: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i)!; if (key.startsWith(this.prefix)) records[key] = localStorage.getItem(key)!; }
    return JSON.stringify({ format: 'replaylab-emergency-export', version: 1, records }, null, 2);
  }
}
export function encodeUpdate(update: Uint8Array) {
  let value = '';
  for (let i = 0; i < update.length; i += 8192) value += String.fromCharCode(...update.subarray(i, i + 8192));
  return btoa(value);
}
export function decodeUpdate(value: string) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
