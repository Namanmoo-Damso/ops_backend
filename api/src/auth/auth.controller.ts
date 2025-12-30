import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppService } from '../app.service';
import {
  KakaoLoginDto,
  RefreshTokenDto,
  AnonymousAuthDto,
} from './dto';

@Controller('v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly appService: AppService,
  ) {}

  @Post('kakao')
  async kakaoLogin(@Body() body: KakaoLoginDto) {
    const kakaoAccessToken = body.kakaoAccessToken?.trim();
    if (!kakaoAccessToken) {
      throw new HttpException(
        'kakaoAccessToken is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      this.logger.log(`kakaoLogin userType=${body.userType ?? 'none'}`);
      const result = await this.authService.kakaoLogin({
        kakaoAccessToken,
        userType: body.userType,
      });
      return result;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`kakaoLogin failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Authentication failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('refresh')
  async refreshTokens(@Body() body: RefreshTokenDto) {
    const refreshToken = body.refreshToken?.trim();
    if (!refreshToken) {
      throw new HttpException(
        'refreshToken is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      this.logger.log('refreshTokens');
      const tokens = await this.authService.refreshTokens(refreshToken);
      return tokens;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`refreshTokens failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Token refresh failed',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('anonymous')
  anonymousAuth(@Body() body: AnonymousAuthDto) {
    const identity = body.identity?.trim() || `user-${Date.now()}`;
    const displayName = body.displayName?.trim() || identity;
    return this.appService.issueApiToken(identity, displayName);
  }
}
