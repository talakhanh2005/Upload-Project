import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { Model } from "mongoose";
import { compare, hash } from "bcryptjs";
import { User, type UserDocument } from "../users/user.schema.js";
import { ChangePasswordDto, LoginDto, StudentAccessDto } from "./auth.dto.js";
import { Role } from "../common/domain.js";
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private users: Model<UserDocument>,
    private jwt: JwtService,
  ) {}
  async login(dto: LoginDto) {
    const user = await this.users
      .findOne({
        email: dto.email.toLowerCase(),
        role: { $in: [Role.ADMIN, Role.TEACHER, Role.PARENT] },
        active: true,
      })
      .select("+credentialHash");
    if (
      !user?.credentialHash ||
      !(await compare(dto.password, user.credentialHash))
    )
      throw new UnauthorizedException("Invalid credentials");
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role }),
      user: { id: user.id, name: user.name, role: user.role },
    };
  }
  async studentAccess(dto: StudentAccessDto) {
    const escapedCode = dto.studentCode
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const student = await this.users
      .findOne({
        studentCode: { $regex: `^${escapedCode}$`, $options: "i" },
        role: Role.STUDENT,
        active: true,
      })
      .select("+studentCode");
    if (!student)
      throw new UnauthorizedException("We could not find that student ID");
    return {
      accessToken: await this.jwt.signAsync(
        { sub: student.id, role: Role.STUDENT, studentId: student.id },
        { expiresIn: "20m" },
      ),
      student: { id: student.id, name: student.name },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users
      .findOne({
        _id: userId,
        role: { $in: [Role.ADMIN, Role.TEACHER] },
        active: true,
      })
      .select("+credentialHash");
    if (
      !user?.credentialHash ||
      !(await compare(dto.currentPassword, user.credentialHash))
    ) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    if (await compare(dto.newPassword, user.credentialHash)) {
      throw new BadRequestException(
        "New password must be different from the current password",
      );
    }
    user.credentialHash = await hash(dto.newPassword, 12);
    await user.save();
    return { message: "Password changed successfully" };
  }
}
