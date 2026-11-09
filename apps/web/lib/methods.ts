// Which CoversService methods the browser may call through /api/covers/[method], and which take no ctx.
import type { CoversService } from '@covers/contract';

export const METHODS = [
  'listSpeakers', 'searchHcps', 'listReps',
  'createPlan', 'getPlan', 'updatePlan', 'evaluatePlan', 'approveException', 'denyException', 'listEvaluations', 'issueFund', 'checkForCharge',
  'submitReceipt', 'getReceipt', 'fixLine', 'confirmAttendance', 'getSettlement', 'addNote', 'listNotes',
  'listPlans', 'getLedger', 'listAudit',
  'listPacks', 'compilePack', 'replayPack', 'promotePack',
  'runBreakIt', 'getProof', 'listDocuments', 'reset',
] as const satisfies readonly (keyof CoversService)[];

export type Method = (typeof METHODS)[number];
export const NO_CTX: readonly Method[] = ['getProof', 'listDocuments'];
export const isMethod = (m: string): m is Method => (METHODS as readonly string[]).includes(m);
