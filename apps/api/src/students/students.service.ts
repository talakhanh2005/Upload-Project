import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { JwtPrincipal, Role } from "../common/domain";
import { Course, CourseDocument } from "../courses/course.schema";
import { Enrollment, EnrollmentDocument } from "../courses/enrollment.schema";
import { StorageService } from "../storage/storage.service";
import {
  Submission,
  SubmissionDocument,
} from "../submissions/submission.schema";
import { User, UserDocument } from "../users/user.schema";
import { CreateStudentDto } from "./students.dto";

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name)
    private readonly enrollments: Model<EnrollmentDocument>,
    @InjectModel(Submission.name)
    private readonly submissions: Model<SubmissionDocument>,
    private readonly storage: StorageService,
  ) {}

  async list(user: JwtPrincipal) {
    if (user.role === Role.ADMIN) {
      const students = await this.users
        .find({ role: Role.STUDENT })
        .select("+studentCode")
        .sort({ name: 1 })
        .lean();
      return students.map((student) => this.present(student, true));
    }
    const ownCourses = await this.courses
      .find({ teacherId: user.sub })
      .select("_id")
      .lean();
    const enrolled = await this.enrollments
      .find({ courseId: { $in: ownCourses.map((course) => course._id) } })
      .select("studentId")
      .lean();
    const students = await this.users
      .find({
        role: Role.STUDENT,
        $or: [
          { createdByTeacherId: new Types.ObjectId(user.sub) },
          { _id: { $in: enrolled.map((item) => item.studentId) } },
        ],
      })
      .select("+studentCode")
      .sort({ name: 1 })
      .lean();
    const legacyStudentIds = new Set(
      enrolled.map((item) => item.studentId.toString()),
    );
    return students.map((student) =>
      this.present(
        student,
        student.createdByTeacherId?.toString() === user.sub ||
          (!student.createdByTeacherId &&
            legacyStudentIds.has(student._id.toString())),
      ),
    );
  }

  async create(dto: CreateStudentDto, user: JwtPrincipal) {
    const studentId = dto.studentId.trim().toUpperCase();
    if (await this.users.exists({ studentCode: studentId }))
      throw new ConflictException("That student ID is already in use");
    const courseIds = dto.courseIds ?? [];
    if (courseIds.length) {
      const courses = await this.courses
        .find({
          _id: { $in: courseIds },
          archivedAt: null,
          ...(user.role === Role.ADMIN ? {} : { teacherId: user.sub }),
        })
        .select("_id")
        .lean();
      if (courses.length !== courseIds.length) {
        throw new NotFoundException("One or more courses were not found");
      }
    }

    let student: UserDocument;
    try {
      student = await this.users.create({
        name: dto.name.trim(),
        description: dto.description.trim(),
        role: Role.STUDENT,
        studentCode: studentId,
        createdByTeacherId: new Types.ObjectId(user.sub),
        active: true,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException("That student ID is already in use");
      }
      throw error;
    }

    try {
      if (courseIds.length) {
        await this.enrollments.insertMany(
          courseIds.map((courseId) => ({
            courseId: new Types.ObjectId(courseId),
            studentId: student._id,
            active: true,
          })),
        );
      }
    } catch (error) {
      await Promise.all([
        this.enrollments.deleteMany({ studentId: student._id }),
        this.users.deleteOne({ _id: student._id }),
      ]);
      throw error;
    }

    return {
      id: student.id,
      studentId,
      name: student.name,
      description: student.description ?? "",
      active: true,
      deletedAt: null,
      canManage: true,
    };
  }

  async softDelete(id: string, user: JwtPrincipal) {
    const student = await this.manageableStudent(id, user);
    if (student.deletedAt) return this.present(student, true);
    student.active = false;
    student.deletedAt = new Date();
    await Promise.all([
      student.save(),
      this.enrollments.updateMany(
        { studentId: student._id, active: true },
        { active: false, suspendedByStudentDeletion: true },
      ),
    ]);
    return this.present(student, true);
  }

  async restore(id: string, user: JwtPrincipal) {
    const student = await this.manageableStudent(id, user);
    if (!student.deletedAt) {
      throw new BadRequestException("Student profile is not deleted");
    }
    student.active = true;
    student.deletedAt = undefined;
    await Promise.all([
      student.save(),
      this.enrollments.updateMany(
        { studentId: student._id, suspendedByStudentDeletion: true },
        { active: true, $unset: { suspendedByStudentDeletion: 1 } },
      ),
    ]);
    return this.present(student, true);
  }

  async permanentlyDelete(id: string, user: JwtPrincipal) {
    const student = await this.manageableStudent(id, user);
    if (!student.deletedAt || student.active) {
      throw new BadRequestException(
        "Soft-delete the student profile before deleting it permanently",
      );
    }
    const submissions = await this.submissions
      .find({ studentId: student._id })
      .select("files")
      .lean();
    await Promise.all(
      submissions.flatMap((submission) =>
        submission.files.map((file) => this.storage.remove(file.storageKey)),
      ),
    );
    await Promise.all([
      this.submissions.deleteMany({ studentId: student._id }),
      this.enrollments.deleteMany({ studentId: student._id }),
      this.users.deleteOne({ _id: student._id }),
    ]);
    return { deleted: true, id: student.id };
  }

  private async manageableStudent(id: string, user: JwtPrincipal) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException("Student not found");
    const student = await this.users
      .findOne({ _id: id, role: Role.STUDENT })
      .select("+studentCode");
    if (!student) throw new NotFoundException("Student not found");
    if (user.role === Role.ADMIN) return student;
    if (student.createdByTeacherId?.toString() === user.sub) return student;
    if (!student.createdByTeacherId) {
      const ownCourseIds = await this.courses
        .find({ teacherId: user.sub })
        .distinct("_id");
      if (
        await this.enrollments.exists({
          studentId: student._id,
          courseId: { $in: ownCourseIds },
        })
      )
        return student;
    }
    throw new ForbiddenException("You cannot manage this student profile");
  }

  private present(
    student: Pick<
      User,
      "name" | "studentCode" | "description" | "active" | "deletedAt"
    > & { _id: Types.ObjectId },
    canManage: boolean,
  ) {
    return {
      id: student._id.toString(),
      studentId: student.studentCode,
      name: student.name,
      description: student.description ?? "",
      active: student.active,
      deletedAt: student.deletedAt ?? null,
      canManage,
    };
  }
}
