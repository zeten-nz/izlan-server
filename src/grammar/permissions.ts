/**
 * Grammatika ruxsatlari: BITTA joyda, sof funksiyalar. Barcha tekshiruvlar serverda (UI faqat natijani ko'rsatadi).
 * Reviewer qo'shish yo'li: `canApprove` ga shart + bitta jadval (hozir faqat ADMIN, ADR-001 D5).
 */
export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export interface Actor {
  id: string;
  role: Role;
}
export type RevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'APPROVED';

export interface RevisionFacts {
  status: RevisionStatus;
  authorId: string | null;
  deleted: boolean;
}
export interface RuleFacts {
  createdById: string | null;
  /** Hech qachon APPROVED revision bo'lganmi */
  everApproved: boolean;
  /** Biror release'ga kirganmi */
  everReleased: boolean;
  /** Nashr qilingan darslarda ishlatilyaptimi */
  inUse: boolean;
  deleted: boolean;
}

const isStaff = (a: Actor) => a.role === 'TEACHER' || a.role === 'ADMIN';
const EDITABLE: readonly RevisionStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];

/** Yangi qoida (va birinchi DRAFT) yaratish. */
export const canCreateRule = (a: Actor) => isStaff(a);

/** Barcha (o'chirilmagan) qoidalarni o'qish; Teacher boshqalarniki uchun faqat o'qish. */
export const canViewRules = (a: Actor) => isStaff(a);

/**
 * Tahrir: Teacher faqat O'Z (author) DRAFT/CHANGES_REQUESTED loyihasini; Admin istalgan tahrir qilinadigan revisionni.
 * APPROVED/IN_REVIEW/REJECTED hech kim tahrir qila olmaydi (o'zgarmas; yangi revision orqali).
 */
export function canEditRevision(a: Actor, r: RevisionFacts): boolean {
  if (r.deleted || !EDITABLE.includes(r.status)) return false;
  if (a.role === 'ADMIN') return true;
  return a.role === 'TEACHER' && r.authorId === a.id;
}

export const canSubmit = (a: Actor, r: RevisionFacts) => canEditRevision(a, r);

/** IN_REVIEW → DRAFT: muallif yoki Admin. */
export function canWithdraw(a: Actor, r: RevisionFacts): boolean {
  if (r.deleted || r.status !== 'IN_REVIEW') return false;
  return a.role === 'ADMIN' || (a.role === 'TEACHER' && r.authorId === a.id);
}

/**
 * Soft delete: faqat hech qachon approved/released bo'lmagan va hech qaerda ishlatilmagan qoida.
 * Teacher faqat o'zi yaratganini; Admin istalganini (xuddi shu shartlar bilan).
 */
export function canSoftDeleteRule(a: Actor, r: RuleFacts): boolean {
  if (r.deleted || r.everApproved || r.everReleased || r.inUse) return false;
  if (a.role === 'ADMIN') return true;
  return a.role === 'TEACHER' && r.createdById === a.id;
}

/** Tasdiqlash/tuzatish so'rash/rad etish (hozir faqat ADMIN; o'zi yozganini ham). */
export const canApprove = (a: Actor) => a.role === 'ADMIN';

/** Approved qoidaga yangi revision (faqat Admin; Teacher hech qachon). */
export const canCreateRevision = (a: Actor) => a.role === 'ADMIN';

/** Kill-switch, retire, release candidate, production holati: faqat Admin. */
export const canModerate = (a: Actor) => a.role === 'ADMIN';

/** Qoida mavjudligi bo'yicha: boshqa muallif loyihasini Teacher ko'radi (faqat o'qish). */
export const canReadRevisionContent = (a: Actor) => isStaff(a);
