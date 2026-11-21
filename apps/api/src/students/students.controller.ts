import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/guards";
import { JwtPrincipal, Role } from "../common/domain";
import { CreateStudentDto } from "./students.dto";
import { StudentsService } from "./students.service";

@ApiTags("students")
@ApiBearerAuth()
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
