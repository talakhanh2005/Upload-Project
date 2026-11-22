jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  ForbiddenException: class extends Error {},
  NotFoundException: class extends Error {},
}));
jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

import { Role } from '../common/domain.js';
import { AssignmentsService } from './assignments.service.js';

describe('AssignmentsService authorization', () => {
  const course = { teacherId: { toString: () => 'owner-id' } };

  function createService() {
    return new AssignmentsService(
      {} as never,
      { findById: jest.fn().mockResolvedValue(course) } as never,
      { exists: jest.fn().mockResolvedValue(false) } as never,
    );
  }

  it('allows the owning teacher to read a course', async () => {
    await expect(createService().assertCourse('507f1f77bcf86cd799439011', {
      sub: 'owner-id', role: Role.TEACHER,
    })).resolves.toBe(course);
  });

  it('rejects a different teacher from reading assignments by course id', async () => {
    await expect(createService().assertCourse('507f1f77bcf86cd799439011', {
      sub: 'other-teacher-id', role: Role.TEACHER,
    })).rejects.toThrow();
  });

  it('rejects parent accounts from reading assignments directly', async () => {
    await expect(createService().assertCourse('507f1f77bcf86cd799439011', {
      sub: 'parent-id', role: Role.PARENT,
    })).rejects.toThrow();
  });
});
