import { describe, expect, it } from 'vitest';
import { buildAttendance, doubleCheck, needsAnswers, noteFor, type Added, type Present } from '../lib/attendance';

const present: Present[] = [{ id: '9000000001', name: 'Dr. Marcus Patel' }, { id: '9000000002', name: 'Dr. Mei Lindqvist' }, { id: 'rep', name: 'You (Jordan Lee)' }];

describe('buildAttendance', () => {
  it('adds doctors to attendedNpis, coworkers to employees, guests to extraGuests', () => {
    const added: Added[] = [
      { kind: 'doctor', id: 'a1', npi: '1234567893', name: 'Dr. New' },
      { kind: 'coworker', id: 'a2', name: 'Sam' },
      { kind: 'guest', id: 'a3', name: 'Alex Lindqvist', withId: '9000000002', relation: 'family' },
    ];
    const a = buildAttendance({ planId: 'p', repId: 'rep-1', people: ['9000000001', '9000000002', '9000000003'], absent: new Set(['9000000003']), added });
    expect(a.attendedNpis).toEqual(['9000000001', '9000000002', '1234567893']);
    expect(a.employeesPresent).toBe(2);
    expect(a.extraGuests).toBe(1);
  });

  it('does not count an added doctor twice, and drops the rep when absent', () => {
    const a = buildAttendance({ planId: 'p', repId: 'r', people: ['9000000001'], absent: new Set(['rep']), added: [{ kind: 'doctor', id: 'a', npi: '9000000001', name: 'Dr. Patel' }] });
    expect(a.attendedNpis).toEqual(['9000000001']);
    expect(a.employeesPresent).toBe(0);
  });
});

describe('doubleCheck', () => {
  it('asks when the receipt prints more covers than people marked', () => {
    const f = doubleCheck({ present, added: [], headcount: 6, printedCovers: 7 });
    expect(f[0]).toMatchObject({ tone: 'ask' });
    expect(f[0]!.text).toContain('7 covers but 6 people');
    expect(needsAnswers(f)).toBe(false); // a cover mismatch alone doesn't block; compliance sees P6.covers
  });

  it('is quiet when the covers match and nobody was added', () => {
    expect(doubleCheck({ present, added: [], headcount: 6, printedCovers: 6 })).toEqual([]);
  });

  it('spots a guest who shares a last name with a doctor at the table', () => {
    const f = doubleCheck({ present, added: [{ kind: 'guest', id: 'g', name: 'Alex Lindqvist' }], headcount: 4 });
    expect(f.some((x) => x.tone === 'ask' && x.text.includes('shares a last name with Dr. Mei Lindqvist'))).toBe(true);
    expect(needsAnswers(f)).toBe(true);
  });

  it('blocks until a guest has who they came with and how they are related', () => {
    const f = doubleCheck({ present, added: [{ kind: 'guest', id: 'g', name: 'Chris Doe', withId: '9000000001' }], headcount: 4 });
    expect(needsAnswers(f)).toBe(true);
    const done = doubleCheck({ present, added: [{ kind: 'guest', id: 'g', name: 'Chris Doe', withId: '9000000001', relation: 'friend' }], headcount: 4 });
    expect(needsAnswers(done)).toBe(false);
    expect(done[0]).toMatchObject({ tone: 'review' });
  });

  it('needs a business reason when the relation is something else', () => {
    const g: Added = { kind: 'guest', id: 'g', name: 'Chris Doe', withId: '9000000001', relation: 'other' };
    expect(needsAnswers(doubleCheck({ present, added: [g], headcount: 4 }))).toBe(true);
    expect(needsAnswers(doubleCheck({ present, added: [{ ...g, reason: 'Hospital purchasing lead' }], headcount: 4 }))).toBe(false);
  });

  it('sends an uninvited doctor to review and passes a coworker', () => {
    const f = doubleCheck({ present, added: [{ kind: 'doctor', id: 'd', npi: '1234567893', name: 'Dr. New' }, { kind: 'coworker', id: 'c', name: 'Sam' }], headcount: 5 });
    expect(f.map((x) => x.tone)).toEqual(['review', 'ok']);
  });
});

describe('noteFor', () => {
  it('records a guest with who they came with and the relation', () => {
    expect(noteFor({ kind: 'guest', id: 'g', name: 'Alex Lindqvist', withId: '9000000002', relation: 'family' }, present))
      .toBe('Added at close-out: Alex Lindqvist, guest of Dr. Mei Lindqvist (family member).');
  });
});
