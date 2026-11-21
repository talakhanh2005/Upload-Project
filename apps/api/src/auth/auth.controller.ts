import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role, JwtPrincipal } from "../common/domain";
import { CurrentUser } from "./current-user";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, StudentAccessDto } from "./auth.dto";
import { JwtAuthGuard, Roles, RolesGuard } from "./guards";
@ApiTags("auth")
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
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: JwtPrincipal,
  ) {
    return this.auth.changePassword(user.sub, dto);
  }
}
