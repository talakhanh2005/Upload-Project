import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Role, type JwtPrincipal } from "../common/domain.js";
import { CurrentUser } from "./current-user.js";
import { AuthService } from "./auth.service.js";
import { ChangePasswordDto, LoginDto, StudentAccessDto } from "./auth.dto.js";
import { JwtAuthGuard, Roles, RolesGuard } from "./guards.js";
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post("login") @HttpCode(200) login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Post("student/access") @HttpCode(200) studentAccess(
    @Body() dto: StudentAccessDto,
  ) {
    return this.auth.studentAccess(dto);
  }

  @Post("change-password")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.auth.changePassword(user.sub, dto);
  }
}
