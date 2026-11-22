import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { hash } from "bcryptjs";
import { Model, Types } from "mongoose";
import { Role } from "../common/domain.js";
import { User, type UserDocument } from "../users/user.schema.js";
import {
  CreateTeacherDto,
  ResetTeacherPasswordDto,
  UpdateTeacherDto,
} from "./teachers.dto.js";

@Injectable()
export class TeachersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  async list() {
    const teachers = await this.users
      .find({ role: Role.TEACHER })
      .sort({ active: -1, name: 1 })
      .lean();
    return teachers.map((teacher) => this.present(teacher));
  }

  async create(dto: CreateTeacherDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.exists({ email })) {
      throw new ConflictException("That email is already in use");
    }
    try {
      const teacher = await this.users.create({
        name: dto.name.trim(),
        email,
        role: Role.TEACHER,
        credentialHash: await hash(dto.temporaryPassword, 12),
        active: true,
      });
      return this.present(teacher);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException("That email is already in use");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const teacher = await this.teacher(id);
    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      if (await this.users.exists({ email, _id: { $ne: teacher._id } })) {
        throw new ConflictException("That email is already in use");
      }
      teacher.email = email;
    }
    if (dto.name) teacher.name = dto.name.trim();
    await teacher.save();
    return this.present(teacher);
  }

  async deactivate(id: string) {
    const teacher = await this.teacher(id);
    teacher.active = false;
    teacher.deletedAt = new Date();
    await teacher.save();
    return this.present(teacher);
  }

  async restore(id: string) {
    const teacher = await this.teacher(id);
    if (!teacher.deletedAt) {
      throw new BadRequestException("Teacher account is already active");
    }
    teacher.active = true;
    teacher.deletedAt = undefined;
    await teacher.save();
    return this.present(teacher);
  }

  async resetPassword(id: string, dto: ResetTeacherPasswordDto) {
    const teacher = await this.teacher(id);
    teacher.credentialHash = await hash(dto.temporaryPassword, 12);
    await teacher.save();
    return { message: "Temporary password updated" };
  }

  drivePolicy() {
    const domain = this.config
      .get<string>("GOOGLE_WORKSPACE_DOMAIN")
      ?.toLowerCase();
    const delegated = Boolean(
      this.config.get<string>("GOOGLE_DRIVE_AUTH_MODE") ===
        "workspace-delegation" &&
      domain &&
      this.config.get<string>("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
      this.config.get<string>("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
    );
    if (delegated) {
      return {
        mode: "WORKSPACE_DELEGATION",
        domain,
        description:
          "Google Workspace is managed centrally by domain-wide delegation.",
      };
    }
    if (this.config.get<string>("GOOGLE_REFRESH_TOKEN")) {
      return {
        mode: "SHARED_DRIVE",
        domain: null,
        description:
          "Uploads use the centrally connected Google Drive account.",
      };
    }
    return {
      mode: "UNCONFIGURED",
      domain: null,
      description: "Google Drive has not been configured for this environment.",
    };
  }

  private async teacher(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException("Teacher not found");
    const teacher = await this.users.findOne({ _id: id, role: Role.TEACHER });
    if (!teacher) throw new NotFoundException("Teacher not found");
    return teacher;
  }

  private present(
    teacher: Pick<User, "name" | "email" | "active" | "deletedAt"> & {
      _id: Types.ObjectId;
    },
  ) {
    const policy = this.drivePolicy();
    const email = teacher.email ?? "";
    const inWorkspace = Boolean(
      policy.domain && email.endsWith(`@${policy.domain}`),
    );
    return {
      id: teacher._id.toString(),
      name: teacher.name,
      email,
      active: teacher.active,
      deletedAt: teacher.deletedAt ?? null,
      driveStatus:
        policy.mode === "WORKSPACE_DELEGATION"
          ? inWorkspace
            ? "MANAGED"
            : "OAUTH_REQUIRED"
          : policy.mode === "SHARED_DRIVE"
            ? "SHARED"
            : "NOT_CONFIGURED",
    };
  }
}
