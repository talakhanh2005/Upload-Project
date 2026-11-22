import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/guards.js";
import { Role } from "../common/domain.js";
import {
  CreateTeacherDto,
  ResetTeacherPasswordDto,
  UpdateTeacherDto,
} from "./teachers.dto.js";
import { TeachersService } from "./teachers.service.js";

@Controller("teachers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TeachersController {
  constructor(private readonly service: TeachersService) {}

  @Get() list() {
    return this.service.list();
  }
  @Get("drive-policy") drivePolicy() {
    return this.service.drivePolicy();
  }
  @Post() create(@Body() dto: CreateTeacherDto) {
    return this.service.create(dto);
  }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateTeacherDto) {
    return this.service.update(id, dto);
  }
  @Delete(":id") deactivate(@Param("id") id: string) {
    return this.service.deactivate(id);
  }
  @Post(":id/restore") restore(@Param("id") id: string) {
    return this.service.restore(id);
  }
  @Post(":id/reset-password") resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetTeacherPasswordDto,
  ) {
    return this.service.resetPassword(id, dto);
  }
}
