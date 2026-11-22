import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Role, type JwtPrincipal } from '../common/domain.js';
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
@Injectable() export class JwtAuthGuard extends AuthGuard('jwt') {}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: JwtPrincipal }>().user;
    if (!user || !roles.includes(user.role)) throw new UnauthorizedException();
    return true;
  }
}
