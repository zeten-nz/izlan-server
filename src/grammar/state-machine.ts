import type { RevisionStatus } from './permissions';

/** Revision holat o'tishlari (DB trigger bilan bir xil jadval; servis ham, trigger ham tekshiradi). */
export const TRANSITIONS: Readonly<Record<RevisionStatus, readonly RevisionStatus[]>> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['DRAFT', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'],
  CHANGES_REQUESTED: ['IN_REVIEW'],
  REJECTED: [],
  APPROVED: [],
};

export const canTransition = (from: RevisionStatus, to: RevisionStatus) => TRANSITIONS[from].includes(to);

/** Tahrir qilinadigan (kontent o'zgaradigan) holatlar. */
export const EDITABLE_STATUSES: readonly RevisionStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];
