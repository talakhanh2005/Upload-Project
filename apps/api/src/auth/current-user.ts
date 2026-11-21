import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPrincipal } from '../common/domain';
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPrincipal => ctx.switchToHttp().getRequest().user);
