import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { randomBytes } from "node:crypto";
import { Model, Types } from "mongoose";
import { CourseStatus, Role, type JwtPrincipal } from "../common/domain.js";
import { User, type UserDocument } from "../users/user.schema.js";
import { Course, type CourseDocument } from "./course.schema.js";
import { CreateCourseDto, UpdateCourseDto } from "./courses.dto.js";
import { Enrollment, type EnrollmentDocument } from "./enrollment.schema.js";

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name)
    private readonly enrollments: Model<EnrollmentDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  async list(user: JwtPrincipal) {
    if (user.role === Role.STUDENT) {
      const enrollments = await this.enrollments
        .find({ studentId: new Types.ObjectId(user.sub), active: true })
        .lean();
      return this.courses
        .find({
          _id: { $in: enrollments.map((item) => item.courseId) },
          archivedAt: null,
        })
        .sort({ createdAt: -1 })
        .lean();
    }
    return this.courses
      .find(
        user.role === Role.ADMIN
          ? { archivedAt: null }
          : { teacherId: user.sub, archivedAt: null },
      )
      .sort({ createdAt: -1 })
      .lean();
  }

  async create(dto: CreateCourseDto, user: JwtPrincipal) {
    const studentIds = dto.studentIds ?? [];
    if (studentIds.length) await this.assertDirectoryStudents(studentIds, user);
    const course = await this.courses.create({
      name: dto.name,
      description: dto.description,
      teacherId: user.sub,
      code: randomBytes(4).toString("hex").toUpperCase(),
    });
    try {
      if (studentIds.length) {
        await this.enrollments.insertMany(
          studentIds.map((studentId) => ({
            courseId: course._id,
            studentId: new Types.ObjectId(studentId),
            active: true,
          })),
        );
      }
      return course;
    } catch (error) {
      await this.courses.deleteOne({ _id: course._id });
      throw error;
    }
  }

  async update(id: string, dto: UpdateCourseDto, user: JwtPrincipal) {
    const course = await this.authorizedCourse(id, user);
    // ValidationPipe creates a DTO instance whose optional properties may still
    // exist with an `undefined` value. Assigning the whole DTO to a Mongoose
    // document can therefore erase required fields such as `name`.
    if (dto.name !== undefined) course.name = dto.name;
    if (dto.description !== undefined) course.description = dto.description;
    if (dto.status !== undefined) course.status = dto.status;
    return course.save();
  }

  async enroll(courseId: string, studentId: string, user: JwtPrincipal) {
    await this.authorizedCourse(courseId, user);
    await this.assertDirectoryStudents([studentId], user);
    return this.enrollments.findOneAndUpdate(
      {
        courseId: new Types.ObjectId(courseId),
        studentId: new Types.ObjectId(studentId),
      },
      { active: true },
      { upsert: true, new: true },
    );
  }

  async unenroll(courseId: string, studentId: string, user: JwtPrincipal) {
    await this.authorizedCourse(courseId, user);
    const enrollment = await this.enrollments.findOneAndUpdate(
      {
        courseId: new Types.ObjectId(courseId),
        studentId: new Types.ObjectId(studentId),
        active: true,
      },
      { active: false },
      { new: true },
    );
    if (!enrollment)
      throw new NotFoundException("Student is not enrolled in this course");
    return enrollment;
  }

  async remove(id: string, user: JwtPrincipal) {
    const course = await this.authorizedCourse(id, user);
    course.archivedAt = new Date();
    course.status = CourseStatus.ENDED;
    await Promise.all([
      course.save(),
      this.enrollments.updateMany(
        { courseId: course._id, active: true },
        { active: false },
      ),
    ]);
    return { deleted: true, id: course.id };
  }

  async students(courseId: string, user: JwtPrincipal) {
    await this.authorizedCourse(courseId, user);
    const enrollments = await this.enrollments
      .find({ courseId: new Types.ObjectId(courseId), active: true })
      .lean();
    const students = await this.users
      .find({
        _id: { $in: enrollments.map((item) => item.studentId) },
        role: Role.STUDENT,
      })
      .select("+studentCode")
      .sort({ name: 1 })
      .lean();
    return students.map((student) => ({
      id: student._id.toString(),
      name: student.name,
      email: student.email,
      studentCode: student.studentCode,
      active: student.active,
    }));
  }

  private async assertDirectoryStudents(
    studentIds: string[],
    user: JwtPrincipal,
  ) {
    const students = await this.users
      .find({ _id: { $in: studentIds }, role: Role.STUDENT, active: true })
      .select("createdByTeacherId")
      .lean();
    if (students.length !== studentIds.length)
      throw new NotFoundException("One or more students were not found");
    if (user.role === Role.ADMIN) return;
    const ownCourses = await this.courses
      .find({ teacherId: user.sub })
      .select("_id")
      .lean();
    const legacyEnrollments = await this.enrollments
      .find({
        courseId: { $in: ownCourses.map((course) => course._id) },
        studentId: { $in: students.map((student) => student._id) },
      })
      .select("studentId")
      .lean();
    const legacyIds = new Set(
      legacyEnrollments.map((item) => item.studentId.toString()),
    );
    const unauthorized = students.some(
      (student) =>
        student.createdByTeacherId?.toString() !== user.sub &&
        !legacyIds.has(student._id.toString()),
    );
    if (unauthorized)
      throw new ForbiddenException(
        "One or more students are not in your directory",
      );
  }

  private async authorizedCourse(id: string, user: JwtPrincipal) {
    const course = await this.courses.findById(id);
    if (!course || course.archivedAt)
      throw new NotFoundException("Course not found");
    if (user.role !== Role.ADMIN && course.teacherId.toString() !== user.sub)
      throw new ForbiddenException();
    return course;
  }
}
