jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
  ConflictException: class extends Error {},
  NotFoundException: class extends Error {},
}));
jest.mock("@nestjs/mongoose", () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));
jest.mock("../storage/storage.service", () => ({
  StorageService: class {},
}));

import { Types } from "mongoose";
import { Role } from "../common/domain.js";
import { StudentsService } from "./students.service.js";

describe("StudentsService", () => {
  it("creates one enrollment for every selected course", async () => {
    const studentObjectId = new Types.ObjectId();
    const courseIds = [
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    ];
    const users = {
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        _id: studentObjectId,
        id: studentObjectId.toString(),
        name: "Student One",
        description: "",
      }),
    };
    const courses = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(courseIds.map((_id) => ({ _id }))),
        }),
      }),
    };
    const enrollments = { insertMany: jest.fn().mockResolvedValue([]) };
    const service = new StudentsService(
      users as never,
      courses as never,
      enrollments as never,
      {} as never,
      {} as never,
    );

    await service.create(
      {
        studentId: "stu-100",
        name: "Student One",
        description: "",
        courseIds,
      },
      { sub: new Types.ObjectId().toString(), role: Role.TEACHER },
    );

    expect(enrollments.insertMany).toHaveBeenCalledWith(
      courseIds.map((courseId) => ({
        courseId: new Types.ObjectId(courseId),
        studentId: studentObjectId,
        active: true,
      })),
    );
  });

  it("soft-deletes and restores a student with their active enrollments", async () => {
    const studentObjectId = new Types.ObjectId();
    const teacherObjectId = new Types.ObjectId();
    const student = {
      _id: studentObjectId,
      id: studentObjectId.toString(),
      studentCode: "STU-200",
      name: "Student Two",
      description: "",
      active: true,
      deletedAt: undefined as Date | undefined,
      createdByTeacherId: teacherObjectId,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const users = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(student),
      }),
    };
    const enrollments = { updateMany: jest.fn().mockResolvedValue({}) };
    const service = new StudentsService(
      users as never,
      {} as never,
      enrollments as never,
      {} as never,
      {} as never,
    );
    const principal = {
      sub: teacherObjectId.toString(),
      role: Role.TEACHER,
    };

    await service.softDelete(studentObjectId.toString(), principal);

    expect(student.active).toBe(false);
    expect(student.deletedAt).toBeInstanceOf(Date);
    expect(enrollments.updateMany).toHaveBeenLastCalledWith(
      { studentId: studentObjectId, active: true },
      { active: false, suspendedByStudentDeletion: true },
    );

    await service.restore(studentObjectId.toString(), principal);

    expect(student.active).toBe(true);
    expect(student.deletedAt).toBeUndefined();
    expect(enrollments.updateMany).toHaveBeenLastCalledWith(
      { studentId: studentObjectId, suspendedByStudentDeletion: true },
      { active: true, $unset: { suspendedByStudentDeletion: 1 } },
    );
  });

  it("permanently deletes only an already soft-deleted profile and its data", async () => {
    const studentObjectId = new Types.ObjectId();
    const teacherObjectId = new Types.ObjectId();
    const student = {
      _id: studentObjectId,
      id: studentObjectId.toString(),
      studentCode: "STU-300",
      name: "Student Three",
      description: "",
      active: false,
      deletedAt: new Date(),
      createdByTeacherId: teacherObjectId,
    };
    const users = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(student),
      }),
      deleteOne: jest.fn().mockResolvedValue({}),
    };
    const enrollments = { deleteMany: jest.fn().mockResolvedValue({}) };
    const submissions = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([
              { files: [{ storageKey: "local:student/file.pdf" }] },
            ]),
        }),
      }),
      deleteMany: jest.fn().mockResolvedValue({}),
    };
    const storage = { remove: jest.fn().mockResolvedValue(undefined) };
    const service = new StudentsService(
      users as never,
      {} as never,
      enrollments as never,
      submissions as never,
      storage as never,
    );

    await service.permanentlyDelete(studentObjectId.toString(), {
      sub: teacherObjectId.toString(),
      role: Role.TEACHER,
    });

    expect(storage.remove).toHaveBeenCalledWith("local:student/file.pdf");
    expect(submissions.deleteMany).toHaveBeenCalledWith({
      studentId: studentObjectId,
    });
    expect(enrollments.deleteMany).toHaveBeenCalledWith({
      studentId: studentObjectId,
    });
    expect(users.deleteOne).toHaveBeenCalledWith({ _id: studentObjectId });
  });
});
