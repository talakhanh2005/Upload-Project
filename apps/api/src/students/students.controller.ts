import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.js";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/guards.js";
import { Role, type JwtPrincipal } from "../common/domain.js";
import { CreateStudentDto } from "./students.dto.js";
import { StudentsService } from "./students.service.js";

@Controller("students")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.TEACHER)
export class StudentsController {
  constructor(private readonly service: StudentsService) {}
  @Get() list(@CurrentUser() user: JwtPrincipal) {
    return this.service.list(user);
  }
  @Post() create(
    @Body() dto: CreateStudentDto,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.create(dto, user);
  }
  @Delete(":id") softDelete(
    @Param("id") id: string,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.softDelete(id, user);
  }
  @Post(":id/restore") restore(
    @Param("id") id: string,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.restore(id, user);
  }
  @Delete(":id/permanent") permanentlyDelete(
    @Param("id") id: string,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.service.permanentlyDelete(id, user);
  }
}
