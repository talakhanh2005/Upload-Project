import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Assignment, AssignmentDocument } from "./assignment.schema";
import { Course, CourseDocument } from "../courses/course.schema";
import { Enrollment, EnrollmentDocument } from "../courses/enrollment.schema";
import { CreateAssignmentDto, UpdateAssignmentDto } from "./assignments.dto";
import { CourseStatus, JwtPrincipal, Role } from "../common/domain";
@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(Assignment.name)
    private assignments: Model<AssignmentDocument>,
    @InjectModel(Course.name) private courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name)
    private enrollments: Model<EnrollmentDocument>,
  ) {}
  async assertCourse(courseId: string, user: JwtPrincipal, write = false) {
    const c = await this.courses.findById(courseId);
    if (!c) throw new NotFoundException("Course not found");
    if (
      user.role === Role.STUDENT &&
      !(await this.enrollments.exists({
        courseId: new Types.ObjectId(courseId),
        studentId: new Types.ObjectId(user.sub),
        active: true,
      }))
    )
      throw new ForbiddenException();
    if (
      write &&
      user.role !== Role.ADMIN &&
      c.teacherId.toString() !== user.sub
    )
      throw new ForbiddenException();
    return c;
  }
  async list(courseId: string, user: JwtPrincipal) {
    await this.assertCourse(courseId, user);
    return this.assignments
      .find({ courseId: new Types.ObjectId(courseId), deleted: false })
      .sort({ deadlineAt: 1 })
      .lean();
  }
  async create(courseId: string, dto: CreateAssignmentDto, user: JwtPrincipal) {
    const c = await this.assertCourse(courseId, user, true);
    if (c.status === CourseStatus.ENDED)
      throw new ForbiddenException("Course has ended");
    return this.assignments.create({
      ...dto,
      courseId: new Types.ObjectId(courseId),
      createdBy: new Types.ObjectId(user.sub),
    });
  }
  async update(id: string, dto: UpdateAssignmentDto, user: JwtPrincipal) {
    const a = await this.assignments.findById(id);
    if (!a) throw new NotFoundException();
    await this.assertCourse(a.courseId.toString(), user, true);
    Object.assign(a, dto);
    return a.save();
  }
}
