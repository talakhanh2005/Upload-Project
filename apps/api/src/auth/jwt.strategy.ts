import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPrincipal } from '../common/domain';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: config.getOrThrow('JWT_SECRET') }); }
  validate(payload: JwtPrincipal) { return payload; }
}
