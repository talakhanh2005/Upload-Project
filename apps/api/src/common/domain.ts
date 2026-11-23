export enum Role { ADMIN = 'ADMIN', TEACHER = 'TEACHER', STUDENT = 'STUDENT', PARENT = 'PARENT' }
export enum CourseStatus { DRAFT = 'DRAFT', ACTIVE = 'ACTIVE', ENDED = 'ENDED' }
export enum FeedbackStatus { NONE = 'NONE', DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED' }
export enum ScanStatus { PENDING = 'PENDING', CLEAN = 'CLEAN', UNSAFE = 'UNSAFE', ERROR = 'ERROR' }
export enum AssignmentKind { FILE_UPLOAD = 'FILE_UPLOAD', INTERACTIVE = 'INTERACTIVE', MIXED = 'MIXED' }
export enum EditorStatus { DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED', ARCHIVED = 'ARCHIVED' }
export enum ExerciseQuestionType { MULTIPLE_CHOICE = 'MULTIPLE_CHOICE', FILL_BLANK = 'FILL_BLANK', IMAGE_MATCH = 'IMAGE_MATCH', SENTENCE_ORDER = 'SENTENCE_ORDER', READ_ALOUD = 'READ_ALOUD' }
export enum ExerciseAttemptStatus { IN_PROGRESS = 'IN_PROGRESS', SUBMITTED = 'SUBMITTED' }
export enum ExerciseGradingStatus { AUTO_GRADED = 'AUTO_GRADED', NEEDS_REVIEW = 'NEEDS_REVIEW', READY_TO_PUBLISH = 'READY_TO_PUBLISH', PUBLISHED = 'PUBLISHED' }
export type JwtPrincipal = { sub: string; role: Role; courseId?: string; studentId?: string };
