import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { DbService } from './db.service';

type UserType = 'guardian' | 'ward';

type KakaoProfile = {
  kakaoId: string;
  email: string | null;
  nickname: string | null;
  profileImageUrl: string | null;
};

type TokenPayload = {
  sub: string;
  type: 'access' | 'refresh' | 'temp';
  userType?: UserType;
  kakaoId?: string;
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type UserInfo = {
  id: string;
  email: string | null;
  nickname: string | null;
  profileImageUrl: string | null;
  userType: UserType | null;
};

type KakaoLoginResult =
  | {
      isNewUser: false;
      accessToken: string;
      refreshToken: string;
      user: UserInfo;
    }
  | {
      isNewUser: true;
      requiresRegistration: true;
      kakaoProfile: KakaoProfile;
      tempToken: string;
    }
  | {
      isNewUser: true;
      requiresRegistration: false;
      accessToken: string;
      refreshToken: string;
      user: UserInfo;
      matchStatus: 'matched' | 'not_matched';
      wardInfo?: {
        phoneNumber: string;
        linkedGuardian?: {
          id: string;
          nickname: string | null;
        };
      };
    };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly accessTokenExpiry: number;
  private readonly refreshTokenExpiry: number;

  constructor(private readonly dbService: DbService) {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.accessTokenExpiry = 60 * 60; // 1 hour
    this.refreshTokenExpiry = 14 * 24 * 60 * 60; // 2 weeks
  }

  async kakaoLogin(params: {
    kakaoAccessToken: string;
    userType?: UserType;
  }): Promise<KakaoLoginResult> {
    // 1. 카카오 토큰 검증
    const kakaoProfile = await this.verifyKakaoToken(params.kakaoAccessToken);
    this.logger.log(`kakaoLogin kakaoId=${kakaoProfile.kakaoId} email=${kakaoProfile.email ?? 'none'}`);

    // 2. 기존 사용자 확인
    const existingUser = await this.dbService.findUserByKakaoId(kakaoProfile.kakaoId);

    if (existingUser) {
      // 기존 사용자 - JWT 발급
      this.logger.log(`kakaoLogin existing user id=${existingUser.id}`);
      const tokens = await this.issueTokens(existingUser.id, existingUser.user_type as UserType);
      return {
        isNewUser: false,
        ...tokens,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          nickname: existingUser.nickname,
          profileImageUrl: existingUser.profile_image_url,
          userType: existingUser.user_type as UserType | null,
        },
      };
    }

    // 3. 신규 사용자
    if (params.userType === 'ward') {
      // 어르신 - 자동 매칭 시도
      return this.handleWardRegistration(kakaoProfile);
    } else {
      // 보호자 - 추가 정보 필요
      const tempToken = this.issueTempToken(kakaoProfile.kakaoId);
      return {
        isNewUser: true,
        requiresRegistration: true,
        kakaoProfile,
        tempToken,
      };
    }
  }

  private async verifyKakaoToken(accessToken: string): Promise<KakaoProfile> {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      this.logger.warn(`verifyKakaoToken failed status=${response.status}`);
      throw new UnauthorizedException('Invalid Kakao access token');
    }

    const data = await response.json();
    return {
      kakaoId: String(data.id),
      email: data.kakao_account?.email ?? null,
      nickname: data.properties?.nickname ?? null,
      profileImageUrl: data.properties?.profile_image ?? null,
    };
  }

  private async handleWardRegistration(
    kakaoProfile: KakaoProfile,
  ): Promise<KakaoLoginResult> {
    // 어르신의 이메일로 보호자 매칭 시도
    const matchedGuardian = kakaoProfile.email
      ? await this.dbService.findGuardianByWardEmail(kakaoProfile.email)
      : undefined;

    // 사용자 생성
    const user = await this.dbService.createUserWithKakao({
      kakaoId: kakaoProfile.kakaoId,
      email: kakaoProfile.email,
      nickname: kakaoProfile.nickname,
      profileImageUrl: kakaoProfile.profileImageUrl,
      userType: 'ward',
    });

    // 어르신 정보 생성
    const ward = await this.dbService.createWard({
      userId: user.id,
      phoneNumber: '', // 이후 설정에서 입력
      guardianId: matchedGuardian?.id ?? null,
    });

    const tokens = await this.issueTokens(user.id, 'ward');

    if (matchedGuardian) {
      this.logger.log(`handleWardRegistration matched userId=${user.id} guardianId=${matchedGuardian.id}`);
      const guardianUser = await this.dbService.findUserById(matchedGuardian.user_id);
      return {
        isNewUser: true,
        requiresRegistration: false,
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          profileImageUrl: user.profile_image_url,
          userType: 'ward',
        },
        matchStatus: 'matched',
        wardInfo: {
          phoneNumber: ward.phone_number,
          linkedGuardian: guardianUser
            ? {
                id: guardianUser.id,
                nickname: guardianUser.nickname,
              }
            : undefined,
        },
      };
    }

    this.logger.log(`handleWardRegistration not matched userId=${user.id}`);
    return {
      isNewUser: true,
      requiresRegistration: false,
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        profileImageUrl: user.profile_image_url,
        userType: 'ward',
      },
      matchStatus: 'not_matched',
      wardInfo: {
        phoneNumber: ward.phone_number,
      },
    };
  }

  private async issueTokens(userId: string, userType: UserType | null): Promise<AuthTokens> {
    const accessPayload: TokenPayload = {
      sub: userId,
      type: 'access',
      userType: userType ?? undefined,
    };

    const refreshPayload: TokenPayload = {
      sub: userId,
      type: 'refresh',
    };

    const accessToken = jwt.sign(accessPayload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
    });

    const refreshToken = jwt.sign(refreshPayload, this.jwtSecret, {
      expiresIn: this.refreshTokenExpiry,
    });

    // Refresh token을 DB에 저장
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTokenExpiry * 1000);
    await this.dbService.saveRefreshToken({
      userId,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private issueTempToken(kakaoId: string): string {
    const payload: TokenPayload = {
      sub: kakaoId,
      type: 'temp',
      kakaoId,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: 30 * 60, // 30 minutes
    });
  }

  verifyAccessToken(token: string): TokenPayload | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as TokenPayload;
      if (payload.type !== 'access') return null;
      return payload;
    } catch {
      return null;
    }
  }

  verifyTempToken(token: string): { kakaoId: string } | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as TokenPayload;
      if (payload.type !== 'temp' || !payload.kakaoId) return null;
      return { kakaoId: payload.kakaoId };
    } catch {
      return null;
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
