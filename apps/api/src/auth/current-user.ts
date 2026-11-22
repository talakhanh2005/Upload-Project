import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPrincipal } from '../common/domain.js';
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPrincipal => ctx.switchToHttp().getRequest().user);
