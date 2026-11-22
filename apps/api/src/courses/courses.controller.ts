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
import { CurrentUser } from "../auth/current-user.js";
import { Role, type JwtPrincipal } from "../common/domain.js";
import { CoursesService } from "./courses.service.js";
import { CreateCourseDto, EnrollDto, UpdateCourseDto } from "./courses.dto.js";
@Controller("courses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private service: CoursesService) {}
  @Get() list(@CurrentUser() user: JwtPrincipal) {
    return this.service.list(user);
  }
  @Post() @Roles(Role.ADMIN, Role.TEACHER) create(
    @Body() dto: CreateCourseDto,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.create(dto, user);
  }
  @Patch(":id") @Roles(Role.ADMIN, Role.TEACHER) update(
    @Param("id") id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.update(id, dto, user);
  }
  @Post(":id/enrollments") @Roles(Role.ADMIN, Role.TEACHER) enroll(
    @Param("id") id: string,
    @Body() dto: EnrollDto,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.enroll(id, dto.studentId, user);
  }
  @Delete(":id/enrollments/:studentId")
  @Roles(Role.ADMIN, Role.TEACHER)
  unenroll(
    @Param("id") id: string,
    @Param("studentId") studentId: string,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.unenroll(id, studentId, user);
  }
  @Get(":id/students") @Roles(Role.ADMIN, Role.TEACHER) students(
    @Param("id") id: string,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.students(id, user);
  }
  @Delete(":id") @Roles(Role.ADMIN, Role.TEACHER) remove(
    @Param("id") id: string,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.remove(id, user);
  }
}
