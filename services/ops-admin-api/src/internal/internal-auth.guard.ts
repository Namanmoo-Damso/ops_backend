import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Internal API Guard
 * 서버 간 내부 통신 인증
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-internal-auth'] as string;
    const serviceName = request.headers['x-service-name'] as string;

    const expectedToken = process.env.INTERNAL_AUTH_SECRET;

    if (!expectedToken) {
      this.logger.warn('INTERNAL_AUTH_SECRET not configured');
      throw new UnauthorizedException('Internal auth not configured');
    }

    if (!token || token !== expectedToken) {
      this.logger.warn(
        `Internal auth failed service=${serviceName || 'unknown'} ip=${request.ip}`,
      );
      throw new UnauthorizedException('Invalid internal auth token');
    }

    this.logger.debug(`Internal auth success service=${serviceName || 'unknown'}`);
    return true;
  }
}
