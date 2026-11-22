jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
  ForbiddenException: class extends Error {},
  NotFoundException: class extends Error {},
}));
jest.mock("@nestjs/mongoose", () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

import { CourseStatus, Role } from "../common/domain.js";
import { UpdateCourseDto } from "./courses.dto.js";
import { CoursesService } from "./courses.service.js";

describe("CoursesService", () => {
  it("updates status without erasing optional course fields", async () => {
    const course = {
      _id: "course-id",
      name: "English 1",
      description: "Conversation class",
      status: CourseStatus.DRAFT,
      teacherId: { toString: () => "teacher-id" },
      archivedAt: null,
      save: jest.fn(function (this: object) {
        return Promise.resolve(this);
      }),
    };
    const service = new CoursesService(
      { findById: jest.fn().mockResolvedValue(course) } as never,
      {} as never,
      {} as never,
    );
    const dto = new UpdateCourseDto();
    dto.status = CourseStatus.ACTIVE;

    await service.update("course-id", dto, {
      sub: "teacher-id",
      role: Role.TEACHER,
    });

    expect(course.name).toBe("English 1");
    expect(course.description).toBe("Conversation class");
    expect(course.status).toBe(CourseStatus.ACTIVE);
    expect(course.save).toHaveBeenCalledTimes(1);
  });
});
