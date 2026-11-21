import { CourseStatus } from '../common/domain';

export type UploadLike = { size: number; mimetype: string };
export type AssignmentWindow = {
  isManuallyLocked: boolean;
  opensAt?: Date;
  closesAt?: Date;
  maxFileCount: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

export const allowedSubmissionMimes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export type SubmissionRejection = 'CLOSED' | 'COUNT' | 'FILE';

export function validateSubmission(courseStatus: CourseStatus, assignment: AssignmentWindow, files: UploadLike[], now: Date): SubmissionRejection | null {
  if (courseStatus !== CourseStatus.ACTIVE || assignment.isManuallyLocked ||
      (assignment.opensAt && now < assignment.opensAt) || (assignment.closesAt && now > assignment.closesAt)) {
    return 'CLOSED';
  }
  if (!files.length || files.length > assignment.maxFileCount) return 'COUNT';
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > assignment.maxTotalBytes || files.some((file) => file.size > assignment.maxFileBytes || !allowedSubmissionMimes.has(file.mimetype))) {
    return 'FILE';
  }
  return null;
}
