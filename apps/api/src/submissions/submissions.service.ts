import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { unlink } from 'node:fs/promises';
import { Assignment, AssignmentDocument } from '../assignments/assignment.schema';
import { FeedbackStatus, JwtPrincipal, Role, ScanStatus } from '../common/domain';
import { Course, CourseDocument } from '../courses/course.schema';
import { Enrollment, EnrollmentDocument } from '../courses/enrollment.schema';
import { StorageService } from '../storage/storage.service';
import { User, UserDocument } from '../users/user.schema';
import { validateSubmission } from './submission.policy';
import { Submission, SubmissionDocument } from './submission.schema';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name) private readonly submissions: Model<SubmissionDocument>,
    @InjectModel(Assignment.name) private readonly assignments: Model<AssignmentDocument>,
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private readonly enrollments: Model<EnrollmentDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly storage: StorageService,
  ) {}

  private async assignment(id: string) {
    const assignment = await this.assignments.findById(id);
    if (!assignment || assignment.deleted) throw new NotFoundException('Assignment not found');
    return assignment;
  }

  async submit(id: string, files: Express.Multer.File[], user: JwtPrincipal) {
    if (user.role !== Role.STUDENT || !user.studentId) throw new ForbiddenException();
    const assignment = await this.assignment(id);
    if (!await this.enrollments.exists({ courseId: assignment.courseId, studentId: user.studentId, active: true })) throw new ForbiddenException();
    const [course, student] = await Promise.all([
      this.courses.findById(assignment.courseId),
      this.users.findById(user.studentId),
    ]);
    if (!course || !student) throw new NotFoundException('Course or student not found');

    const now = new Date();
    const rejection = validateSubmission(course.status, assignment, files, now);
    if (rejection) await Promise.allSettled(files.map((file) => unlink(file.path)));
    if (rejection === 'CLOSED') throw new ForbiddenException('Submissions are closed');
    if (rejection === 'COUNT') throw new BadRequestException('Upload 1 to 25 files');
    if (rejection === 'FILE') throw new BadRequestException('File type or size is not allowed');

    const uploaded = [];
    try {
      for (const file of files) {
        uploaded.push(await this.storage.store(file, {
          courseName: `${course.code} - ${course.name}`,
          assignmentName: `${assignment.id} - ${assignment.title}`,
          studentName: `${student.id} - ${student.name}`,
        }));
      }
    } catch (error) {
      await Promise.allSettled(uploaded.map((file) => this.storage.remove(file.storageKey)));
      await Promise.allSettled(files.map((file) => unlink(file.path)));
      throw error;
    }

    const previous = await this.submissions.findOne({ assignmentId: id, studentId: user.studentId }).lean();
    let committed: SubmissionDocument;
    try {
      committed = await this.submissions.findOneAndUpdate(
        { assignmentId: id, studentId: user.studentId },
        {
          submittedAt: now,
          status: now > assignment.deadlineAt ? 'LATE' : 'SUBMITTED',
          files: uploaded.map((file) => ({ ...file, scanStatus: ScanStatus.CLEAN })),
          reviewedAt: null,
          feedbackStatus: FeedbackStatus.NONE,
          feedbackText: '',
        },
        { upsert: true, new: true },
      ).orFail();
    } catch (error) {
      await Promise.allSettled(uploaded.map((file) => this.storage.remove(file.storageKey)));
      throw error;
    }

    if (previous) await Promise.allSettled(previous.files.map((file) => this.storage.remove(file.storageKey)));
    return committed;
  }

  async mine(id: string, user: JwtPrincipal) {
    if (!user.studentId) throw new ForbiddenException();
    const assignment = await this.assignment(id);
    if (!await this.enrollments.exists({ courseId: assignment.courseId, studentId: user.studentId, active: true })) throw new ForbiddenException();
    return this.submissions.findOne({ assignmentId: id, studentId: user.studentId }).lean();
  }

  async listByAssignment(id: string, user: JwtPrincipal) {
    const assignment = await this.assignment(id);
    await this.assertTeacher(id, user);
    const enrollments = await this.enrollments.find({ courseId: assignment.courseId, active: true }).lean();
    const studentIds = enrollments.map((item) => item.studentId);
    const [students, submissions] = await Promise.all([
      this.users.find({ _id: { $in: studentIds }, role: Role.STUDENT }).sort({ name: 1 }).lean(),
      this.submissions.find({ assignmentId: assignment._id, studentId: { $in: studentIds } }).lean(),
    ]);
    const submissionByStudent = new Map(submissions.map((submission) => [submission.studentId.toString(), submission]));
    return students.map((student) => {
      const submission = submissionByStudent.get(student._id.toString());
      return {
        student: { id: student._id.toString(), name: student.name, email: student.email },
        status: submission?.status ?? 'MISSING',
        submission: submission ?? null,
      };
    });
  }

  async review(id: string, user: JwtPrincipal) {
    const submission = await this.submissions.findById(id);
    if (!submission) throw new NotFoundException();
    await this.assertTeacher(submission.assignmentId.toString(), user);
    submission.reviewedAt = new Date();
    return submission.save();
  }

  async feedback(id: string, text: string, publish: boolean, user: JwtPrincipal) {
    const submission = await this.submissions.findById(id);
    if (!submission) throw new NotFoundException();
    await this.assertTeacher(submission.assignmentId.toString(), user);
    submission.feedbackText = text;
    submission.feedbackStatus = publish ? FeedbackStatus.PUBLISHED : FeedbackStatus.DRAFT;
    submission.feedbackPublishedAt = publish ? new Date() : undefined;
    return submission.save();
  }

  async openFile(submissionId: string, index: number, user: JwtPrincipal) {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) throw new NotFoundException('Submission not found');
    const assignment = await this.assignment(submission.assignmentId.toString());
    const course = await this.courses.findById(assignment.courseId);
    if (!course) throw new NotFoundException('Course not found');

    const isOwner = user.role === Role.STUDENT && user.studentId === submission.studentId.toString() && Boolean(await this.enrollments.exists({ courseId: course._id, studentId: user.studentId, active: true }));
    const isTeacher = user.role === Role.TEACHER && course.teacherId.toString() === user.sub;
    if (user.role !== Role.ADMIN && !isOwner && !isTeacher) throw new ForbiddenException();

    const file = submission.files[index];
    if (!file) throw new NotFoundException('File not found');
    if (file.scanStatus !== ScanStatus.CLEAN) throw new ForbiddenException('File is not available');
    return { file, opened: await this.storage.open(file.storageKey, file.mime) };
  }

  storageHealth() { return this.storage.health(); }

  private async assertTeacher(assignmentId: string, user: JwtPrincipal) {
    const assignment = await this.assignment(assignmentId);
    const course = await this.courses.findById(assignment.courseId);
    if (!course || (user.role !== Role.ADMIN && course.teacherId.toString() !== user.sub)) throw new ForbiddenException();
  }
}
