import { CourseStatus } from '../common/domain';
import { validateSubmission } from './submission.policy';

const limits = { isManuallyLocked: false, maxFileCount: 25, maxFileBytes: 25 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 };
const pdf = (size: number) => ({ size, mimetype: 'application/pdf' });

describe('submission policy', () => {
  it('accepts the exact 100 MB boundary', () => {
    expect(validateSubmission(CourseStatus.ACTIVE, limits, [pdf(25 * 1024 * 1024), pdf(25 * 1024 * 1024), pdf(25 * 1024 * 1024), pdf(25 * 1024 * 1024)], new Date())).toBeNull();
  });
  it('rejects more than 25 files', () => {
    expect(validateSubmission(CourseStatus.ACTIVE, limits, Array.from({ length: 26 }, () => pdf(1)), new Date())).toBe('COUNT');
  });
  it('rejects a locked assignment and an ended course', () => {
    expect(validateSubmission(CourseStatus.ACTIVE, { ...limits, isManuallyLocked: true }, [pdf(1)], new Date())).toBe('CLOSED');
    expect(validateSubmission(CourseStatus.ENDED, limits, [pdf(1)], new Date())).toBe('CLOSED');
  });
  it('rejects unsupported executable content types', () => {
    expect(validateSubmission(CourseStatus.ACTIVE, limits, [{ size: 20, mimetype: 'application/x-msdownload' }], new Date())).toBe('FILE');
  });
});
