// Every rule cites a document and passage that exist in the documents store, so "open the source" never dead-ends.
import { describe, expect, it } from 'vitest';
import { fixtures } from '@covers/contract/fixtures';
import { RULE_SOURCES, cite } from '../src/index';

describe('rule sources', () => {
  const docs = new Map(fixtures.documents.map((d) => [d.id, d]));

  it.each(RULE_SOURCES.map((s) => [s.ruleId, s] as const))('%s points to a stored passage', (_id, s) => {
    const doc = docs.get(s.docId);
    expect(doc, `document ${s.docId}`).toBeDefined();
    expect(doc!.passages.some((p) => p.id === s.passageId), `passage ${s.docId}#${s.passageId}`).toBe(true);
    expect(cite(s.ruleId)).toMatchObject({ docId: s.docId, passageId: s.passageId });
  });

  it('labels the fictional company policy as fictional wherever a rule cites it', () => {
    for (const s of RULE_SOURCES.filter((x) => x.docId === 'halden-policy')) expect(cite(s.ruleId).label).toContain('fictional');
  });

  it('keeps document and passage ids unique', () => {
    expect(new Set(fixtures.documents.map((d) => d.id)).size).toBe(fixtures.documents.length);
    for (const d of fixtures.documents) expect(new Set(d.passages.map((p) => p.id)).size).toBe(d.passages.length);
  });
});
