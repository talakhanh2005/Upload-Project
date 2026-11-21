export enum Role { ADMIN = 'ADMIN', TEACHER = 'TEACHER', STUDENT = 'STUDENT', PARENT = 'PARENT' }
export enum CourseStatus { DRAFT = 'DRAFT', ACTIVE = 'ACTIVE', ENDED = 'ENDED' }
export enum FeedbackStatus { NONE = 'NONE', DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED' }
export enum ScanStatus { PENDING = 'PENDING', CLEAN = 'CLEAN', UNSAFE = 'UNSAFE', ERROR = 'ERROR' }
export type JwtPrincipal = { sub: string; role: Role; courseId?: string; studentId?: string };
