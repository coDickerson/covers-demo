// How each audit action reads in the audit trail and on documents.
export const AUDIT_LABEL: Record<string, string> = {
  'plan.created': 'Created the plan',
  'plan.updated': 'Changed the guest list',
  'plan.evaluated': 'Ran the checks',
  'exception.approved': 'Approved an exception',
  'exception.denied': 'Denied an exception',
  'note.added': 'Added a note',
  'fund.issued': 'Issued the card',
  'charge.seen': 'Saw the card charge',
  'ramp.memo_written': 'Wrote the memo and receipt to Ramp',
  'fund.locked': 'Locked the card',
  'receipt.read': 'Read the receipt',
  'receipt.line_fixed': 'Corrected a receipt line',
  'attendance.confirmed': 'Confirmed who ate and settled',
};
