import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parse } from 'csv-parse/sync';
import { AppService } from './app.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { NotificationScheduler } from './notification.scheduler';
import { AiService } from './ai.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
    private readonly dbService: DbService,
    private readonly notificationScheduler: NotificationScheduler,
    private readonly aiService: AiService,
  ) {}

  @Get('/healthz')
  getHealth() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  /**
   * POST /webhook/kakao/unlink
   * 카카오 연결 해제 웹훅 (연동해제/카카오계정 탈퇴)
   *
   * 카카오 웹훅 스펙:
   * - Content-Type: application/x-www-form-urlencoded
   * - Header: Authorization: KakaoAK ${ADMIN_KEY}
   * - Body: app_id, user_id, referrer_type
   * - 3초 내 무조건 200 응답 필수
   *
   * referrer_type:
   * - TALK_CHANNEL_FRIEND: 카카오톡 채널에서 연결 끊기
   * - KAKAO_ACCOUNT: 카카오계정 설정에서 연결 끊기/탈퇴
   */
  @Post('/webhook/kakao/unlink')
  async kakaoUnlink(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { app_id?: string; user_id?: string; referrer_type?: string },
  ) {
    // 카카오 웹훅 인증 확인 (선택적 - 보안 강화 시 활성화)
    // const expectedAuth = `KakaoAK ${process.env.KAKAO_ADMIN_KEY}`;
    // if (authorization !== expectedAuth) {
    //   this.logger.warn('kakaoUnlink unauthorized');
    //   return { success: true }; // 여전히 200 응답
    // }

    const appId = body.app_id?.toString().trim();
    const kakaoId = body.user_id?.toString().trim();
    const referrerType = body.referrer_type ?? 'unknown';

    this.logger.log(`kakaoUnlink received appId=${appId} kakaoId=${kakaoId} type=${referrerType}`);

    if (!kakaoId) {
      // 카카오 웹훅은 반드시 200 응답해야 함
      this.logger.warn('kakaoUnlink missing user_id');
      return { success: true };
    }

    // 비동기로 처리하되 3초 이내 응답 보장
    setImmediate(async () => {
      try {
        const user = await this.dbService.findUserByKakaoId(kakaoId);
        if (!user) {
          this.logger.log(`kakaoUnlink user not found kakaoId=${kakaoId}`);
          return;
        }

        await this.dbService.deleteUser(user.id);
        this.logger.log(`kakaoUnlink deleted userId=${user.id} kakaoId=${kakaoId}`);
      } catch (error) {
        this.logger.error(`kakaoUnlink failed kakaoId=${kakaoId} error=${(error as Error).message}`);
      }
    });

    // 즉시 200 응답
    return { success: true };
  }

  @Post('/v1/auth/kakao')
  async authKakao(
    @Body()
    body: {
      kakaoAccessToken?: string;
      userType?: 'guardian' | 'ward';
    },
  ) {
    const kakaoAccessToken = body.kakaoAccessToken?.trim();
    if (!kakaoAccessToken) {
      throw new HttpException(
        'kakaoAccessToken is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      this.logger.log(`authKakao userType=${body.userType ?? 'none'}`);
      const result = await this.authService.kakaoLogin({
        kakaoAccessToken,
        userType: body.userType,
      });
      return result;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`authKakao failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Authentication failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('/v1/auth/refresh')
  async authRefresh(@Body() body: { refreshToken?: string }) {
    const refreshToken = body.refreshToken?.trim();
    if (!refreshToken) {
      throw new HttpException('refreshToken is required', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log('authRefresh');
      const tokens = await this.authService.refreshTokens(refreshToken);
      return tokens;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`authRefresh failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Token refresh failed',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('/v1/users/register/guardian')
  async registerGuardian(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      wardEmail?: string;
      wardPhoneNumber?: string;
    },
  ) {
    // Authorization header에서 temp token 추출
    const authHeader = authorization ?? '';
    const tempToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!tempToken) {
      throw new HttpException('Temp token is required', HttpStatus.UNAUTHORIZED);
    }

    const wardEmail = body.wardEmail?.trim();
    const wardPhoneNumber = body.wardPhoneNumber?.trim();

    if (!wardEmail) {
      throw new HttpException('wardEmail is required', HttpStatus.BAD_REQUEST);
    }
    if (!wardPhoneNumber) {
      throw new HttpException('wardPhoneNumber is required', HttpStatus.BAD_REQUEST);
    }

    // 간단한 이메일 형식 검증
    if (!wardEmail.includes('@')) {
      throw new HttpException('Invalid email format', HttpStatus.BAD_REQUEST);
    }

    // 간단한 전화번호 형식 검증 (숫자와 하이픈만 허용)
    if (!/^[\d-]+$/.test(wardPhoneNumber)) {
      throw new HttpException('Invalid phone number format', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`registerGuardian wardEmail=${wardEmail}`);
      const result = await this.authService.registerGuardian({
        tempToken,
        wardEmail,
        wardPhoneNumber,
      });
      return result;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`registerGuardian failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Registration failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('/v1/users/me')
  async getMe(@Headers('authorization') authorization: string | undefined) {
    // Access token 검증
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`getMe userId=${user.id}`);

      const baseResponse = {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        profileImageUrl: user.profile_image_url,
        userType: user.user_type,
        createdAt: user.created_at,
      };

      if (user.user_type === 'guardian') {
        const guardian = await this.dbService.findGuardianByUserId(user.id);
        const linkedWard = guardian
          ? await this.dbService.findWardByGuardianId(guardian.id)
          : undefined;

        return {
          ...baseResponse,
          guardianInfo: guardian
            ? {
                id: guardian.id,
                wardEmail: guardian.ward_email,
                wardPhoneNumber: guardian.ward_phone_number,
                linkedWard: linkedWard
                  ? {
                      id: linkedWard.user_id,
                      nickname: linkedWard.user_nickname,
                      profileImageUrl: linkedWard.user_profile_image_url,
                    }
                  : null,
              }
            : null,
        };
      } else if (user.user_type === 'ward') {
        const ward = await this.dbService.findWardByUserId(user.id);
        const linkedGuardian = ward?.guardian_id
          ? await this.dbService.findGuardianById(ward.guardian_id)
          : undefined;

        return {
          ...baseResponse,
          wardInfo: ward
            ? {
                id: ward.id,
                phoneNumber: ward.phone_number,
                aiPersona: ward.ai_persona,
                weeklyCallCount: ward.weekly_call_count,
                callDurationMinutes: ward.call_duration_minutes,
                linkedGuardian: linkedGuardian
                  ? {
                      id: linkedGuardian.user_id,
                      nickname: linkedGuardian.user_nickname,
                      profileImageUrl: linkedGuardian.user_profile_image_url,
                    }
                  : null,
                linkedOrganization: null,
              }
            : null,
        };
      }

      return baseResponse;
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getMe failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get user info', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('/v1/users/me')
  async deleteMe(@Headers('authorization') authorization: string | undefined) {
    // Access token 검증
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`deleteMe userId=${user.id}`);
      await this.dbService.deleteUser(user.id);

      return {
        success: true,
        message: '회원탈퇴가 완료되었습니다.',
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`deleteMe failed error=${(error as Error).message}`);
      throw new HttpException('Failed to delete user', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/guardian/dashboard')
  async getGuardianDashboard(@Headers('authorization') authorization: string | undefined) {
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'guardian') {
        throw new HttpException('Guardian access required', HttpStatus.FORBIDDEN);
      }

      const guardian = await this.dbService.findGuardianByUserId(user.id);
      if (!guardian) {
        throw new HttpException('Guardian info not found', HttpStatus.NOT_FOUND);
      }

      const linkedWard = await this.dbService.findWardByGuardianId(guardian.id);
      if (!linkedWard) {
        // 연결된 어르신이 없는 경우 빈 대시보드 반환
        return {
          statistics: {
            totalCalls: 0,
            weeklyChange: 0,
            averageDuration: 0,
            overallMood: { positive: 0, negative: 0 },
          },
          alerts: [],
          recentCalls: [],
        };
      }

      this.logger.log(`getGuardianDashboard guardianId=${guardian.id} wardId=${linkedWard.id}`);

      const [stats, weeklyChange, moodStats, alerts, recentCalls] = await Promise.all([
        this.dbService.getWardCallStats(linkedWard.id),
        this.dbService.getWardWeeklyCallChange(linkedWard.id),
        this.dbService.getWardMoodStats(linkedWard.id),
        this.dbService.getHealthAlerts(guardian.id, 5),
        this.dbService.getRecentCallSummaries(linkedWard.id, 5),
      ]);

      return {
        statistics: {
          totalCalls: stats.totalCalls,
          weeklyChange,
          averageDuration: stats.avgDuration,
          overallMood: moodStats,
        },
        alerts,
        recentCalls,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getGuardianDashboard failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get dashboard', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/guardian/report')
  async getGuardianReport(
    @Headers('authorization') authorization: string | undefined,
    @Query('period') period?: string,
  ) {
    const payload = this.verifyAuthHeader(authorization);
    const reportPeriod = period === 'month' ? 'month' : 'week';
    const days = reportPeriod === 'month' ? 30 : 7;

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'guardian') {
        throw new HttpException('Guardian access required', HttpStatus.FORBIDDEN);
      }

      const guardian = await this.dbService.findGuardianByUserId(user.id);
      if (!guardian) {
        throw new HttpException('Guardian info not found', HttpStatus.NOT_FOUND);
      }

      const linkedWard = await this.dbService.findWardByGuardianId(guardian.id);
      if (!linkedWard) {
        return {
          period: reportPeriod,
          emotionTrend: [],
          healthKeywords: {},
          topTopics: [],
          weeklySummary: '연결된 어르신이 없습니다.',
          recommendations: [],
        };
      }

      this.logger.log(`getGuardianReport guardianId=${guardian.id} wardId=${linkedWard.id} period=${reportPeriod}`);

      const [emotionTrend, healthKeywords, topTopics, summaries] = await Promise.all([
        this.dbService.getEmotionTrend(linkedWard.id, days),
        this.dbService.getHealthKeywordStats(linkedWard.id, days),
        this.dbService.getTopTopics(linkedWard.id, days, 5),
        this.dbService.getCallSummariesForReport(linkedWard.id, days),
      ]);

      // AI 요약 대신 간단한 요약 생성
      const summaryTexts = summaries
        .filter((s) => s.summary)
        .map((s) => s.summary)
        .slice(0, 3);
      const weeklySummary = summaryTexts.length > 0
        ? `최근 ${days}일간 ${summaries.length}건의 대화가 있었습니다. ${summaryTexts.join(' ')}`
        : `최근 ${days}일간 대화 기록이 없습니다.`;

      // 간단한 추천 사항 생성
      const recommendations: string[] = [];
      if (healthKeywords.pain.count > 0) {
        recommendations.push('통증 관련 언급이 있었습니다. 건강 상태를 확인해보세요.');
      }
      if (emotionTrend.some((e) => e.mood === 'negative')) {
        recommendations.push('부정적인 감정이 감지되었습니다. 대화를 나눠보세요.');
      }
      if (summaries.length < 3) {
        recommendations.push('대화 빈도가 적습니다. 정기적인 통화를 권장합니다.');
      }

      return {
        period: reportPeriod,
        emotionTrend,
        healthKeywords,
        topTopics,
        weeklySummary,
        recommendations,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getGuardianReport failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get report', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/guardian/wards')
  async getGuardianWards(@Headers('authorization') authorization: string | undefined) {
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'guardian') {
        throw new HttpException('Guardian access required', HttpStatus.FORBIDDEN);
      }

      const guardian = await this.dbService.findGuardianByUserId(user.id);
      if (!guardian) {
        throw new HttpException('Guardian info not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`getGuardianWards guardianId=${guardian.id}`);

      const wards = await this.dbService.getGuardianWards(guardian.id);

      return {
        wards: wards.map((w) => ({
          id: w.id,
          email: w.ward_email,
          phoneNumber: w.ward_phone_number,
          isPrimary: w.is_primary,
          nickname: w.ward_nickname,
          profileImageUrl: w.ward_profile_image_url,
          isLinked: w.linked_ward_id !== null,
          lastCallAt: w.last_call_at,
        })),
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getGuardianWards failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get wards', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/v1/guardian/wards')
  async createGuardianWard(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { wardEmail?: string; wardPhoneNumber?: string },
  ) {
    const payload = this.verifyAuthHeader(authorization);

    const wardEmail = body.wardEmail?.trim();
    const wardPhoneNumber = body.wardPhoneNumber?.trim();

    if (!wardEmail) {
      throw new HttpException('wardEmail is required', HttpStatus.BAD_REQUEST);
    }
    if (!wardPhoneNumber) {
      throw new HttpException('wardPhoneNumber is required', HttpStatus.BAD_REQUEST);
    }
    if (!wardEmail.includes('@')) {
      throw new HttpException('Invalid email format', HttpStatus.BAD_REQUEST);
    }
    if (!/^[\d-]+$/.test(wardPhoneNumber)) {
      throw new HttpException('Invalid phone number format', HttpStatus.BAD_REQUEST);
    }

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'guardian') {
        throw new HttpException('Guardian access required', HttpStatus.FORBIDDEN);
      }

      const guardian = await this.dbService.findGuardianByUserId(user.id);
      if (!guardian) {
        throw new HttpException('Guardian info not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`createGuardianWard guardianId=${guardian.id} wardEmail=${wardEmail}`);

      const registration = await this.dbService.createGuardianWardRegistration({
        guardianId: guardian.id,
        wardEmail,
        wardPhoneNumber,
      });

      return {
        id: registration.id,
        wardEmail: registration.ward_email,
        wardPhoneNumber: registration.ward_phone_number,
        isLinked: false,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`createGuardianWard failed error=${(error as Error).message}`);
      throw new HttpException('Failed to create ward', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('/v1/guardian/wards/:wardId')
  async updateGuardianWard(
    @Headers('authorization') authorization: string | undefined,
    @Param('wardId') wardId: string,
    @Body() body: { wardEmail?: string; wardPhoneNumber?: string },
  ) {
    const payload = this.verifyAuthHeader(authorization);

    const wardEmail = body.wardEmail?.trim();
    const wardPhoneNumber = body.wardPhoneNumber?.trim();

    if (!wardEmail) {
      throw new HttpException('wardEmail is required', HttpStatus.BAD_REQUEST);
    }
    if (!wardPhoneNumber) {
      throw new HttpException('wardPhoneNumber is required', HttpStatus.BAD_REQUEST);
    }
    if (!wardEmail.includes('@')) {
      throw new HttpException('Invalid email format', HttpStatus.BAD_REQUEST);
    }
    if (!/^[\d-]+$/.test(wardPhoneNumber)) {
      throw new HttpException('Invalid phone number format', HttpStatus.BAD_REQUEST);
    }

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'guardian') {
        throw new HttpException('Guardian access required', HttpStatus.FORBIDDEN);
      }

      const guardian = await this.dbService.findGuardianByUserId(user.id);
      if (!guardian) {
        throw new HttpException('Guardian info not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`updateGuardianWard guardianId=${guardian.id} wardId=${wardId}`);

      // 1차 등록(primary) 수정인지 확인
      if (wardId === guardian.id) {
        const updated = await this.dbService.updateGuardianPrimaryWard({
          guardianId: guardian.id,
          wardEmail,
          wardPhoneNumber,
        });
        if (!updated) {
          throw new HttpException('Ward not found', HttpStatus.NOT_FOUND);
        }
        return {
          id: updated.id,
          wardEmail: updated.ward_email,
          wardPhoneNumber: updated.ward_phone_number,
          isPrimary: true,
        };
      }

      // 추가 등록 수정
      const updated = await this.dbService.updateGuardianWardRegistration({
        id: wardId,
        guardianId: guardian.id,
        wardEmail,
        wardPhoneNumber,
      });

      if (!updated) {
        throw new HttpException('Ward not found', HttpStatus.NOT_FOUND);
      }

      return {
        id: updated.id,
        wardEmail: updated.ward_email,
        wardPhoneNumber: updated.ward_phone_number,
        isPrimary: false,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`updateGuardianWard failed error=${(error as Error).message}`);
      throw new HttpException('Failed to update ward', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('/v1/guardian/wards/:wardId')
  async deleteGuardianWard(
    @Headers('authorization') authorization: string | undefined,
    @Param('wardId') wardId: string,
  ) {
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'guardian') {
        throw new HttpException('Guardian access required', HttpStatus.FORBIDDEN);
      }

      const guardian = await this.dbService.findGuardianByUserId(user.id);
      if (!guardian) {
        throw new HttpException('Guardian info not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`deleteGuardianWard guardianId=${guardian.id} wardId=${wardId}`);

      // 1차 등록(primary)은 삭제 불가, 연결만 해제
      if (wardId === guardian.id) {
        await this.dbService.unlinkPrimaryWard(guardian.id);
        return {
          success: true,
          message: '연결이 해제되었습니다.',
        };
      }

      // 추가 등록 삭제
      const deleted = await this.dbService.deleteGuardianWardRegistration(wardId, guardian.id);
      if (!deleted) {
        throw new HttpException('Ward not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        message: '연결이 해제되었습니다.',
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`deleteGuardianWard failed error=${(error as Error).message}`);
      throw new HttpException('Failed to delete ward', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/ward/settings')
  async getWardSettings(@Headers('authorization') authorization: string | undefined) {
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'ward') {
        throw new HttpException('Ward access required', HttpStatus.FORBIDDEN);
      }

      const ward = await this.dbService.findWardByUserId(user.id);
      if (!ward) {
        throw new HttpException('Ward info not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`getWardSettings userId=${user.id} wardId=${ward.id}`);

      const notificationSettings = await this.dbService.getNotificationSettings(user.id);

      return {
        aiPersona: ward.ai_persona,
        weeklyCallCount: ward.weekly_call_count,
        callDurationMinutes: ward.call_duration_minutes,
        notificationSettings: {
          callReminder: notificationSettings.call_reminder,
          callComplete: notificationSettings.call_complete,
          healthAlert: notificationSettings.health_alert,
        },
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getWardSettings failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get ward settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('/v1/ward/settings')
  async updateWardSettings(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      aiPersona?: string;
      weeklyCallCount?: number;
      callDurationMinutes?: number;
    },
  ) {
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'ward') {
        throw new HttpException('Ward access required', HttpStatus.FORBIDDEN);
      }

      const ward = await this.dbService.findWardByUserId(user.id);
      if (!ward) {
        throw new HttpException('Ward info not found', HttpStatus.NOT_FOUND);
      }

      // 입력값 검증
      if (body.weeklyCallCount !== undefined && (body.weeklyCallCount < 1 || body.weeklyCallCount > 7)) {
        throw new HttpException('weeklyCallCount must be between 1 and 7', HttpStatus.BAD_REQUEST);
      }
      if (body.callDurationMinutes !== undefined && (body.callDurationMinutes < 5 || body.callDurationMinutes > 60)) {
        throw new HttpException('callDurationMinutes must be between 5 and 60', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`updateWardSettings userId=${user.id} wardId=${ward.id}`);

      const updated = await this.dbService.updateWardSettings({
        wardId: user.id,
        aiPersona: body.aiPersona?.trim(),
        weeklyCallCount: body.weeklyCallCount,
        callDurationMinutes: body.callDurationMinutes,
      });

      if (!updated) {
        throw new HttpException('Failed to update settings', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        aiPersona: updated.ai_persona,
        weeklyCallCount: updated.weekly_call_count,
        callDurationMinutes: updated.call_duration_minutes,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`updateWardSettings failed error=${(error as Error).message}`);
      throw new HttpException('Failed to update ward settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private verifyAuthHeader(authorization: string | undefined) {
    const authHeader = authorization ?? '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!token) {
      throw new HttpException('Authorization required', HttpStatus.UNAUTHORIZED);
    }

    const payload = this.authService.verifyAccessToken(token);
    if (!payload) {
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }

    return payload;
  }

  @Get('/v1/rooms/:roomName/members')
  async listRoomMembers(
    @Headers('authorization') authorization: string | undefined,
    @Param('roomName') roomNameParam: string,
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const roomName = roomNameParam?.trim();
    if (!roomName) {
      throw new HttpException('roomName is required', HttpStatus.BAD_REQUEST);
    }

    const members = await this.appService.listRoomMembers(roomName);
    this.logger.log(`listRoomMembers room=${roomName} count=${members.length}`);
    return { roomName, members };
  }

  @Post('/v1/auth/anonymous')
  authAnonymous(@Body() body: { identity?: string; displayName?: string }) {
    const identity = body.identity?.trim() || `user-${Date.now()}`;
    const displayName = body.displayName?.trim() || identity;
    return this.appService.issueApiToken(identity, displayName);
  }

  @Post('/v1/rtc/token')
  async rtcToken(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      roomName?: string;
      identity?: string;
      name?: string;
      role?: 'host' | 'viewer' | 'observer';
      livekitUrl?: string;
      apnsToken?: string;
      voipToken?: string;
      platform?: string;
      env?: 'prod' | 'sandbox';
      supportsCallKit?: boolean;
    },
  ) {
    const config = this.appService.getConfig();
    const authHeader = authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    let authIdentity: string | undefined;
    let authName: string | undefined;
    if (bearer) {
      try {
        const payload = this.appService.verifyApiToken(bearer);
        authIdentity = payload.identity;
        authName = payload.displayName;
      } catch (error) {
        if (config.authRequired) {
          throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
      }
    } else if (config.authRequired) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const roomName = body.roomName?.trim();
    if (!roomName) {
      throw new HttpException('roomName is required', HttpStatus.BAD_REQUEST);
    }

    const identity = (body.identity ?? authIdentity)?.trim();
    if (!identity) {
      throw new HttpException('identity is required', HttpStatus.BAD_REQUEST);
    }

    const name = (body.name ?? authName ?? identity).trim();
    const role = body.role ?? 'viewer';

    if (!['host', 'viewer', 'observer'].includes(role)) {
      throw new HttpException('invalid role', HttpStatus.BAD_REQUEST);
    }

    const livekitUrlOverride = this.normalizeLivekitUrl(body.livekitUrl);
    if (body.livekitUrl && !livekitUrlOverride) {
      throw new HttpException('invalid livekitUrl', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `rtcToken room=${roomName} identity=${identity} role=${role} env=${body.env ?? 'default'} livekit=${livekitUrlOverride ?? 'default'} apns=${this.summarizeToken(body.apnsToken)} voip=${this.summarizeToken(body.voipToken)}`,
    );

    const rtcData = await this.appService.issueRtcToken({
      roomName,
      identity,
      name,
      role,
      device:
        body.apnsToken || body.voipToken || body.platform || body.env || body.supportsCallKit !== undefined
          ? {
              apnsToken: body.apnsToken?.trim(),
              voipToken: body.voipToken?.trim(),
              platform: body.platform?.trim(),
              env: body.env,
              supportsCallKit: body.supportsCallKit,
            }
          : undefined,
    });
    return {
      ...rtcData,
      livekitUrl: livekitUrlOverride ?? rtcData.livekitUrl,
    };
  }

  @Post('/v1/devices/register')
  async registerDevice(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      identity?: string;
      displayName?: string;
      platform?: string;
      env?: 'prod' | 'sandbox';
      apnsToken?: string;
      voipToken?: string;
      supportsCallKit?: boolean;
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const identity = body.identity?.trim() || auth?.identity;
    if (!identity) {
      throw new HttpException('identity is required', HttpStatus.BAD_REQUEST);
    }

    const displayName = body.displayName?.trim() || auth?.displayName;
    const platform = body.platform?.trim() || 'ios';
    const env = body.env;
    const supportsCallKit = body.supportsCallKit ?? true;

    if (env && !['prod', 'sandbox'].includes(env)) {
      throw new HttpException('invalid env', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(
        `registerDevice identity=${identity} platform=${platform} env=${env ?? 'default'} supportsCallKit=${supportsCallKit} apns=${this.summarizeToken(body.apnsToken)} voip=${this.summarizeToken(body.voipToken)}`,
      );
      return await this.appService.registerDevice({
        identity,
        displayName,
        platform,
        env,
        apnsToken: body.apnsToken,
        voipToken: body.voipToken,
        supportsCallKit,
      });
    } catch (error) {
      this.logger.warn(
        `registerDevice failed identity=${identity} error=${(error as Error).message}`,
      );
      throw new HttpException(
        (error as Error).message || 'Bad request',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('/v1/push/broadcast')
  async pushBroadcast(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      type?: 'alert' | 'voip';
      title?: string;
      body?: string;
      payload?: Record<string, unknown>;
      env?: 'prod' | 'sandbox';
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const type = body.type ?? 'alert';
    if (!['alert', 'voip'].includes(type)) {
      throw new HttpException('invalid type', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `pushBroadcast type=${type} env=${body.env ?? 'default'} payloadKeys=${this.summarizePayloadKeys(body.payload)}`,
    );
    return await this.appService.sendBroadcastPush({
      type,
      title: body.title,
      body: body.body,
      payload: body.payload,
      env: body.env,
    });
  }

  @Post('/v1/push/user')
  async pushUser(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      identity?: string;
      type?: 'alert' | 'voip';
      title?: string;
      body?: string;
      payload?: Record<string, unknown>;
      env?: 'prod' | 'sandbox';
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const identity = body.identity?.trim() || auth?.identity;
    if (!identity) {
      throw new HttpException('identity is required', HttpStatus.BAD_REQUEST);
    }

    const type = body.type ?? 'alert';
    if (!['alert', 'voip'].includes(type)) {
      throw new HttpException('invalid type', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `pushUser identity=${identity} type=${type} env=${body.env ?? 'default'} payloadKeys=${this.summarizePayloadKeys(body.payload)}`,
    );
    return await this.appService.sendUserPush({
      identity,
      type,
      title: body.title,
      body: body.body,
      payload: body.payload,
      env: body.env,
    });
  }

  @Post('/v1/calls/invite')
  async inviteCall(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      callerIdentity?: string;
      callerName?: string;
      calleeIdentity?: string;
      roomName?: string;
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callerIdentity = body.callerIdentity?.trim() || auth?.identity;
    if (!callerIdentity) {
      throw new HttpException('callerIdentity is required', HttpStatus.BAD_REQUEST);
    }
    const calleeIdentity = body.calleeIdentity?.trim();
    if (!calleeIdentity) {
      throw new HttpException('calleeIdentity is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `inviteCall caller=${callerIdentity} callee=${calleeIdentity} room=${body.roomName ?? 'auto'}`,
    );
    return await this.appService.inviteCall({
      callerIdentity,
      callerName: body.callerName?.trim(),
      calleeIdentity,
      roomName: body.roomName?.trim(),
    });
  }

  @Post('/v1/calls/answer')
  async answerCall(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { callId?: string },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callId = body.callId?.trim();
    if (!callId) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`answerCall callId=${callId}`);
    return await this.appService.answerCall(callId);
  }

  @Post('/v1/calls/end')
  async endCall(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { callId?: string },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callId = body.callId?.trim();
    if (!callId) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`endCall callId=${callId}`);
    const result = await this.appService.endCall(callId);

    // 비동기로 보호자에게 통화 완료 알림 전송
    this.notificationScheduler.notifyCallComplete(callId).catch((error) => {
      this.logger.warn(`endCall notifyCallComplete failed callId=${callId} error=${(error as Error).message}`);
    });

    return result;
  }

  @Post('/v1/calls/:callId/analyze')
  async analyzeCall(
    @Headers('authorization') authorization: string | undefined,
    @Param('callId') callId: string,
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!callId?.trim()) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`analyzeCall callId=${callId}`);

    try {
      const result = await this.aiService.analyzeCall(callId);
      return result;
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('not found')) {
        throw new HttpException('Call not found', HttpStatus.NOT_FOUND);
      }
      this.logger.error(`analyzeCall failed callId=${callId} error=${message}`);
      throw new HttpException('Failed to analyze call', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/v1/admin/wards/bulk-upload')
  @UseInterceptors(FileInterceptor('file'))
  async bulkUploadWards(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { organizationId?: string },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // Get admin ID from token
    let adminId: string | undefined;
    if (authorization?.startsWith('Bearer ')) {
      try {
        const tokenPayload = this.authService.verifyAdminAccessToken(authorization.slice(7));
        adminId = tokenPayload.sub;
      } catch {
        // Non-admin token, continue without admin ID
      }
    }

    if (!file) {
      throw new HttpException('file is required', HttpStatus.BAD_REQUEST);
    }

    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      throw new HttpException('organizationId is required', HttpStatus.BAD_REQUEST);
    }

    // 파일 크기 제한 (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new HttpException('File size exceeds 5MB limit', HttpStatus.BAD_REQUEST);
    }

    // 기관 존재 확인
    const organization = await this.dbService.findOrganization(organizationId);
    if (!organization) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }

    this.logger.log(`bulkUploadWards organizationId=${organizationId} adminId=${adminId ?? 'none'} fileSize=${file.size}`);

    try {
      // CSV 파싱
      const records = parse(file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<{
        email?: string;
        phone_number?: string;
        name?: string;
        birth_date?: string;
        address?: string;
        notes?: string;
      }>;

      const results = {
        total: records.length,
        created: 0,
        skipped: 0,
        failed: 0,
        errors: [] as Array<{ row: number; email: string; reason: string }>,
      };

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const row = i + 2; // 헤더 제외, 1-indexed
        const email = record.email?.trim() ?? '';

        try {
          // 유효성 검증
          if (!email || !this.isValidEmail(email)) {
            throw new Error('잘못된 이메일 형식');
          }
          if (!record.phone_number?.trim()) {
            throw new Error('전화번호 필수');
          }
          if (!record.name?.trim()) {
            throw new Error('이름 필수');
          }

          // 중복 체크
          const existing = await this.dbService.findOrganizationWard(organizationId, email);
          if (existing) {
            results.skipped++;
            continue;
          }

          // 저장 (관리자 ID 포함)
          await this.dbService.createOrganizationWard({
            organizationId,
            email,
            phoneNumber: record.phone_number.trim(),
            name: record.name.trim(),
            birthDate: record.birth_date?.trim() || null,
            address: record.address?.trim() || null,
            uploadedByAdminId: adminId,
            notes: record.notes?.trim() || undefined,
          });

          results.created++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row,
            email,
            reason: (error as Error).message,
          });
        }
      }

      this.logger.log(
        `bulkUploadWards completed organizationId=${organizationId} adminId=${adminId ?? 'none'} total=${results.total} created=${results.created} skipped=${results.skipped} failed=${results.failed}`,
      );

      return {
        success: true,
        ...results,
      };
    } catch (error) {
      this.logger.error(`bulkUploadWards failed error=${(error as Error).message}`);
      throw new HttpException('Failed to process CSV file', HttpStatus.BAD_REQUEST);
    }
  }

  @Get('/v1/admin/my-wards')
  async getMyManagedWards(
    @Headers('authorization') authorization: string | undefined,
  ) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const tokenPayload = this.authService.verifyAdminAccessToken(authorization.slice(7));
    const adminId = tokenPayload.sub;

    const [wards, stats] = await Promise.all([
      this.dbService.getMyManagedWards(adminId),
      this.dbService.getMyManagedWardsStats(adminId),
    ]);

    return {
      wards: wards.map((w) => ({
        id: w.id,
        organizationId: w.organization_id,
        organizationName: w.organization_name,
        email: w.email,
        phoneNumber: w.phone_number,
        name: w.name,
        birthDate: w.birth_date,
        address: w.address,
        notes: w.notes,
        isRegistered: w.is_registered,
        wardId: w.ward_id,
        createdAt: w.created_at,
        lastCallAt: w.last_call_at,
        totalCalls: parseInt(w.total_calls || '0', 10),
        lastMood: w.last_mood,
      })),
      stats,
    };
  }

  // ============================================================
  // Location Endpoints
  // ============================================================

  @Post('/v1/locations')
  async updateLocation(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      timestamp?: string;
    },
  ) {
    const payload = this.verifyAuthHeader(authorization);

    // 위도 검증
    if (body.latitude === undefined || typeof body.latitude !== 'number') {
      throw new HttpException('latitude is required', HttpStatus.BAD_REQUEST);
    }
    if (body.latitude < -90 || body.latitude > 90) {
      throw new HttpException('latitude must be between -90 and 90', HttpStatus.BAD_REQUEST);
    }

    // 경도 검증
    if (body.longitude === undefined || typeof body.longitude !== 'number') {
      throw new HttpException('longitude is required', HttpStatus.BAD_REQUEST);
    }
    if (body.longitude < -180 || body.longitude > 180) {
      throw new HttpException('longitude must be between -180 and 180', HttpStatus.BAD_REQUEST);
    }

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'ward') {
        throw new HttpException('Ward access required', HttpStatus.FORBIDDEN);
      }

      const ward = await this.dbService.findWardByUserId(user.id);
      if (!ward) {
        throw new HttpException('Ward info not found', HttpStatus.NOT_FOUND);
      }

      const recordedAt = body.timestamp ? new Date(body.timestamp) : new Date();
      const accuracy = body.accuracy ?? null;

      this.logger.log(
        `updateLocation wardId=${ward.id} lat=${body.latitude} lng=${body.longitude}`,
      );

      // 위치 이력 저장
      await this.dbService.createWardLocation({
        wardId: ward.id,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy,
        recordedAt,
      });

      // 현재 위치 업데이트
      const currentLocation = await this.dbService.upsertWardCurrentLocation({
        wardId: ward.id,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy,
      });

      return {
        success: true,
        wardId: ward.id,
        latitude: parseFloat(currentLocation.latitude),
        longitude: parseFloat(currentLocation.longitude),
        lastUpdated: currentLocation.last_updated,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`updateLocation failed error=${(error as Error).message}`);
      throw new HttpException('Failed to update location', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/admin/locations')
  async getAdminLocations(
    @Headers('authorization') authorization: string | undefined,
    @Query('organizationId') organizationId?: string,
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    this.logger.log(`getAdminLocations organizationId=${organizationId ?? 'all'}`);

    try {
      const locations = await this.dbService.getAllWardCurrentLocations(organizationId);

      return {
        locations: locations.map((loc) => ({
          wardId: loc.ward_id,
          wardName: loc.ward_nickname || loc.ward_name || '이름 없음',
          latitude: parseFloat(loc.latitude),
          longitude: parseFloat(loc.longitude),
          accuracy: loc.accuracy ? parseFloat(loc.accuracy) : null,
          lastUpdated: loc.last_updated,
          status: loc.status,
          organizationId: loc.organization_id,
        })),
      };
    } catch (error) {
      this.logger.warn(`getAdminLocations failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get locations', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/admin/locations/:wardId/history')
  async getAdminLocationHistory(
    @Headers('authorization') authorization: string | undefined,
    @Param('wardId') wardId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!wardId?.trim()) {
      throw new HttpException('wardId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`getAdminLocationHistory wardId=${wardId} from=${from ?? 'none'} to=${to ?? 'none'}`);

    try {
      // ward 존재 확인
      const ward = await this.dbService.findWardById(wardId);
      if (!ward) {
        throw new HttpException('Ward not found', HttpStatus.NOT_FOUND);
      }

      const history = await this.dbService.getWardLocationHistory({
        wardId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: limit ? parseInt(limit, 10) : 100,
      });

      return {
        wardId,
        history: history.map((loc) => ({
          latitude: parseFloat(loc.latitude),
          longitude: parseFloat(loc.longitude),
          accuracy: loc.accuracy ? parseFloat(loc.accuracy) : null,
          timestamp: loc.recorded_at,
        })),
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getAdminLocationHistory failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get location history', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('/v1/admin/locations/:wardId/status')
  async updateAdminLocationStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('wardId') wardId: string,
    @Body() body: { status?: string },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!wardId?.trim()) {
      throw new HttpException('wardId is required', HttpStatus.BAD_REQUEST);
    }

    const status = body.status?.trim();
    if (!status || !['normal', 'warning', 'emergency'].includes(status)) {
      throw new HttpException(
        'status must be one of: normal, warning, emergency',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`updateAdminLocationStatus wardId=${wardId} status=${status}`);

    try {
      const ward = await this.dbService.findWardById(wardId);
      if (!ward) {
        throw new HttpException('Ward not found', HttpStatus.NOT_FOUND);
      }

      await this.dbService.updateWardLocationStatus(
        wardId,
        status as 'normal' | 'warning' | 'emergency',
      );

      return {
        success: true,
        wardId,
        status,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`updateAdminLocationStatus failed error=${(error as Error).message}`);
      throw new HttpException('Failed to update status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================================================
  // Emergency Endpoints
  // ============================================================

  @Post('/v1/emergency')
  async triggerEmergency(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      type?: 'manual' | 'ai_detected' | 'geofence';
      latitude?: number;
      longitude?: number;
      message?: string;
    },
  ) {
    const payload = this.verifyAuthHeader(authorization);

    // 타입 검증
    const emergencyType = body.type || 'manual';
    if (!['manual', 'ai_detected', 'geofence'].includes(emergencyType)) {
      throw new HttpException(
        'type must be one of: manual, ai_detected, geofence',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Ward 사용자 확인
      const user = await this.dbService.findUserById(payload.sub);
      if (!user || user.user_type !== 'ward') {
        throw new HttpException('Ward access required', HttpStatus.FORBIDDEN);
      }

      const ward = await this.dbService.findWardByUserId(user.id);
      if (!ward) {
        throw new HttpException('Ward info not found', HttpStatus.NOT_FOUND);
      }

      // 위치 정보가 없으면 현재 저장된 위치 사용
      let latitude = body.latitude;
      let longitude = body.longitude;
      if (latitude === undefined || longitude === undefined) {
        const currentLocation = await this.dbService.getWardCurrentLocation(ward.id);
        if (currentLocation) {
          latitude = parseFloat(currentLocation.latitude);
          longitude = parseFloat(currentLocation.longitude);
        }
      }

      this.logger.log(
        `triggerEmergency wardId=${ward.id} type=${emergencyType} lat=${latitude} lng=${longitude}`,
      );

      // 1. 비상 상황 생성
      const emergency = await this.dbService.createEmergency({
        wardId: ward.id,
        type: emergencyType,
        latitude,
        longitude,
        message: body.message?.trim(),
      });

      // 2. 위치 상태를 emergency로 업데이트
      await this.dbService.updateWardLocationStatus(ward.id, 'emergency');

      // 3. 가까운 관계기관 찾기 (위치가 있을 때만)
      const nearbyAgencies: Array<{
        id: string;
        name: string;
        type: string;
        distance: number;
        contacted: boolean;
      }> = [];

      if (latitude !== undefined && longitude !== undefined) {
        const agencies = await this.dbService.findNearbyAgencies(latitude, longitude, 10, 5);
        for (const agency of agencies) {
          const distanceKm = parseFloat(agency.distance_km);
          await this.dbService.createEmergencyContact({
            emergencyId: emergency.id,
            agencyId: agency.id,
            distanceKm,
            responseStatus: 'pending',
          });
          nearbyAgencies.push({
            id: agency.id,
            name: agency.name,
            type: agency.type,
            distance: Math.round(distanceKm * 10) / 10,
            contacted: true,
          });
        }
      }

      // 4. 보호자에게 푸시 알림 전송
      let guardianNotified = false;
      const wardInfo = await this.dbService.getWardWithGuardianInfo(ward.id);
      if (wardInfo?.guardian_identity) {
        try {
          await this.appService.sendUserPush({
            identity: wardInfo.guardian_identity,
            type: 'alert',
            title: '🚨 비상 알림',
            body: `${wardInfo.ward_name || '피보호자'}님이 비상 버튼을 눌렀습니다`,
            payload: {
              type: 'emergency',
              emergencyId: emergency.id,
              wardId: ward.id,
              latitude,
              longitude,
            },
          });
          await this.dbService.updateEmergencyGuardianNotified(emergency.id);
          guardianNotified = true;
        } catch (pushError) {
          this.logger.warn(`Emergency guardian push failed: ${(pushError as Error).message}`);
        }
      }

      return {
        emergencyId: emergency.id,
        status: 'dispatched',
        nearbyAgencies,
        guardianNotified,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.error(`triggerEmergency failed error=${(error as Error).message}`);
      throw new HttpException('Failed to trigger emergency', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/v1/admin/emergency')
  async triggerAdminEmergency(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      wardId?: string;
      message?: string;
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const wardId = body.wardId?.trim();
    if (!wardId) {
      throw new HttpException('wardId is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const ward = await this.dbService.findWardById(wardId);
      if (!ward) {
        throw new HttpException('Ward not found', HttpStatus.NOT_FOUND);
      }

      // 현재 위치 가져오기
      const currentLocation = await this.dbService.getWardCurrentLocation(wardId);
      const latitude = currentLocation ? parseFloat(currentLocation.latitude) : undefined;
      const longitude = currentLocation ? parseFloat(currentLocation.longitude) : undefined;

      this.logger.log(`triggerAdminEmergency wardId=${wardId}`);

      // 1. 비상 상황 생성
      const emergency = await this.dbService.createEmergency({
        wardId,
        type: 'admin',
        latitude,
        longitude,
        message: body.message?.trim(),
      });

      // 2. 위치 상태를 emergency로 업데이트
      await this.dbService.updateWardLocationStatus(wardId, 'emergency');

      // 3. 가까운 관계기관 찾기
      const nearbyAgencies: Array<{
        id: string;
        name: string;
        type: string;
        distance: number;
        contacted: boolean;
      }> = [];

      if (latitude !== undefined && longitude !== undefined) {
        const agencies = await this.dbService.findNearbyAgencies(latitude, longitude, 10, 5);
        for (const agency of agencies) {
          const distanceKm = parseFloat(agency.distance_km);
          await this.dbService.createEmergencyContact({
            emergencyId: emergency.id,
            agencyId: agency.id,
            distanceKm,
            responseStatus: 'pending',
          });
          nearbyAgencies.push({
            id: agency.id,
            name: agency.name,
            type: agency.type,
            distance: Math.round(distanceKm * 10) / 10,
            contacted: true,
          });
        }
      }

      // 4. 보호자에게 푸시 알림 전송
      let guardianNotified = false;
      const wardInfo = await this.dbService.getWardWithGuardianInfo(wardId);
      if (wardInfo?.guardian_identity) {
        try {
          await this.appService.sendUserPush({
            identity: wardInfo.guardian_identity,
            type: 'alert',
            title: '🚨 비상 알림',
            body: `관제센터에서 ${wardInfo.ward_name || '피보호자'}님에 대해 비상 상황을 발동했습니다`,
            payload: {
              type: 'emergency',
              emergencyId: emergency.id,
              wardId,
            },
          });
          await this.dbService.updateEmergencyGuardianNotified(emergency.id);
          guardianNotified = true;
        } catch (pushError) {
          this.logger.warn(`Admin emergency guardian push failed: ${(pushError as Error).message}`);
        }
      }

      return {
        emergencyId: emergency.id,
        status: 'dispatched',
        nearbyAgencies,
        guardianNotified,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.error(`triggerAdminEmergency failed error=${(error as Error).message}`);
      throw new HttpException('Failed to trigger emergency', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/admin/emergencies')
  async getAdminEmergencies(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status?: string,
    @Query('wardId') wardId?: string,
    @Query('limit') limit?: string,
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // status 검증
    const validStatuses = ['active', 'resolved', 'false_alarm'];
    if (status && !validStatuses.includes(status)) {
      throw new HttpException(
        `status must be one of: ${validStatuses.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`getAdminEmergencies status=${status ?? 'all'} wardId=${wardId ?? 'all'}`);

    try {
      const emergencies = await this.dbService.getEmergencies({
        status: status as 'active' | 'resolved' | 'false_alarm' | undefined,
        wardId: wardId?.trim(),
        limit: limit ? parseInt(limit, 10) : 50,
      });

      // 각 비상상황에 연락 기록도 함께 조회
      const emergenciesWithContacts = await Promise.all(
        emergencies.map(async (e) => {
          const contacts = await this.dbService.getEmergencyContacts(e.id);
          return {
            id: e.id,
            wardId: e.ward_id,
            wardName: e.ward_name || '알 수 없음',
            type: e.type,
            status: e.status,
            latitude: e.latitude ? parseFloat(e.latitude) : null,
            longitude: e.longitude ? parseFloat(e.longitude) : null,
            message: e.message,
            guardianNotified: e.guardian_notified,
            createdAt: e.created_at,
            resolvedAt: e.resolved_at,
            respondedAgencies: contacts.map((c) => c.agency_name),
          };
        }),
      );

      return {
        emergencies: emergenciesWithContacts,
      };
    } catch (error) {
      this.logger.warn(`getAdminEmergencies failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get emergencies', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/v1/admin/emergencies/:id')
  async getAdminEmergencyDetail(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') emergencyId: string,
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!emergencyId?.trim()) {
      throw new HttpException('emergencyId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`getAdminEmergencyDetail emergencyId=${emergencyId}`);

    try {
      const emergency = await this.dbService.getEmergencyById(emergencyId);
      if (!emergency) {
        throw new HttpException('Emergency not found', HttpStatus.NOT_FOUND);
      }

      const contacts = await this.dbService.getEmergencyContacts(emergencyId);

      return {
        id: emergency.id,
        wardId: emergency.ward_id,
        wardName: emergency.ward_name || '알 수 없음',
        type: emergency.type,
        status: emergency.status,
        latitude: emergency.latitude ? parseFloat(emergency.latitude) : null,
        longitude: emergency.longitude ? parseFloat(emergency.longitude) : null,
        message: emergency.message,
        guardianNotified: emergency.guardian_notified,
        resolvedAt: emergency.resolved_at,
        resolvedBy: emergency.resolved_by,
        resolutionNote: emergency.resolution_note,
        createdAt: emergency.created_at,
        contacts: contacts.map((c) => ({
          id: c.id,
          agencyId: c.agency_id,
          agencyName: c.agency_name,
          agencyType: c.agency_type,
          distanceKm: parseFloat(c.distance_km),
          responseStatus: c.response_status,
          contactedAt: c.contacted_at,
        })),
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getAdminEmergencyDetail failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get emergency detail', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('/v1/admin/emergencies/:id/resolve')
  async resolveAdminEmergency(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') emergencyId: string,
    @Body()
    body: {
      status?: 'resolved' | 'false_alarm';
      resolutionNote?: string;
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!emergencyId?.trim()) {
      throw new HttpException('emergencyId is required', HttpStatus.BAD_REQUEST);
    }

    const resolveStatus = body.status || 'resolved';
    if (!['resolved', 'false_alarm'].includes(resolveStatus)) {
      throw new HttpException(
        'status must be one of: resolved, false_alarm',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`resolveAdminEmergency emergencyId=${emergencyId} status=${resolveStatus}`);

    try {
      const emergency = await this.dbService.getEmergencyById(emergencyId);
      if (!emergency) {
        throw new HttpException('Emergency not found', HttpStatus.NOT_FOUND);
      }

      if (emergency.status !== 'active') {
        throw new HttpException('Emergency is already resolved', HttpStatus.BAD_REQUEST);
      }

      // 해결자 ID (인증 정보에서)
      const resolvedBy = auth?.identity || 'admin';
      // 실제로는 user lookup을 하지만 간단히 처리
      let resolvedByUserId: string | null = null;
      try {
        const user = await this.dbService.upsertUser(resolvedBy);
        resolvedByUserId = user.id;
      } catch {
        // ignore
      }

      const resolved = await this.dbService.resolveEmergency({
        emergencyId,
        resolvedBy: resolvedByUserId || resolvedBy,
        status: resolveStatus,
        resolutionNote: body.resolutionNote?.trim(),
      });

      // 위치 상태를 normal로 복구
      if (emergency.ward_id) {
        await this.dbService.updateWardLocationStatus(emergency.ward_id, 'normal');
      }

      return {
        success: true,
        emergencyId: resolved.id,
        status: resolved.status,
        resolvedAt: resolved.resolved_at,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`resolveAdminEmergency failed error=${(error as Error).message}`);
      throw new HttpException('Failed to resolve emergency', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // [관제 대시보드 API] - Issue #17
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /v1/admin/dashboard/stats
   * 관제 대시보드 전체 통계 조회
   */
  @Get('v1/admin/dashboard/stats')
  async getDashboardStats() {
    this.logger.log('getDashboardStats called');

    try {
      const [
        overview,
        todayStats,
        weeklyTrend,
        moodDistribution,
        healthAlerts,
        topKeywords,
        organizationStats,
        recentActivity,
      ] = await Promise.all([
        this.dbService.getDashboardOverview(),
        this.dbService.getTodayStats(),
        this.dbService.getWeeklyTrend(),
        this.dbService.getMoodDistribution(),
        this.dbService.getHealthAlertsSummary(),
        this.dbService.getTopHealthKeywords(10),
        this.dbService.getOrganizationStats(),
        this.dbService.getRecentActivity(20),
      ]);

      return {
        overview,
        todayStats,
        weeklyTrend,
        moodDistribution,
        healthAlerts,
        topKeywords,
        organizationStats,
        recentActivity,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(`getDashboardStats failed error=${(error as Error).message}`);
      throw new HttpException('Failed to fetch dashboard stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /v1/admin/dashboard/realtime
   * 관제 대시보드 실시간 통계 (빈번한 폴링용)
   */
  @Get('v1/admin/dashboard/realtime')
  async getDashboardRealtime() {
    this.logger.log('getDashboardRealtime called');

    try {
      const [realtime, recentActivity] = await Promise.all([
        this.dbService.getRealtimeStats(),
        this.dbService.getRecentActivity(10),
      ]);

      return {
        ...realtime,
        recentActivity,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(`getDashboardRealtime failed error=${(error as Error).message}`);
      throw new HttpException('Failed to fetch realtime stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // [관제 관리자 OAuth API] - Issue #18
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /admin/auth/oauth/code
   * OAuth authorization code를 access token으로 교환 후 로그인 처리
   * (클라이언트에서 client_secret 노출 방지)
   */
  @Post('admin/auth/oauth/code')
  async adminOAuthCodeExchange(
    @Body() body: { provider?: string; code?: string; redirectUri?: string },
  ) {
    const provider = body.provider?.trim().toLowerCase();
    const code = body.code?.trim();
    const redirectUri = body.redirectUri?.trim();

    if (!provider || !code || !redirectUri) {
      throw new HttpException(
        'provider, code, and redirectUri are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (provider !== 'kakao' && provider !== 'google') {
      throw new HttpException(
        'provider must be kakao or google',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`adminOAuthCodeExchange provider=${provider}`);

    try {
      // Authorization code를 access token으로 교환
      const accessToken = await this.exchangeCodeForToken(provider, code, redirectUri);

      // 기존 OAuth 로그인 로직 재사용
      const oauthUser = await this.verifyOAuthToken(provider, accessToken);

      if (!oauthUser.email) {
        throw new HttpException(
          '이메일 정보를 가져올 수 없습니다. 이메일 제공 동의가 필요합니다.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 기존 관리자 확인
      let admin = await this.dbService.findAdminByProviderId(provider, oauthUser.providerId);

      if (!admin) {
        admin = await this.dbService.findAdminByEmail(oauthUser.email);

        if (admin) {
          throw new HttpException(
            `이미 ${admin.provider}로 가입된 계정입니다.`,
            HttpStatus.CONFLICT,
          );
        }

        // 첫 번째 관리자는 super_admin, 이후는 admin 권한 부여
        const newAdmin = await this.dbService.createAdmin({
          email: oauthUser.email,
          name: oauthUser.name,
          provider,
          providerId: oauthUser.providerId,
        });

        admin = await this.dbService.findAdminById(newAdmin.id);
      }

      if (!admin!.is_active) {
        throw new HttpException(
          '계정이 비활성화되었습니다. 관리자에게 문의하세요.',
          HttpStatus.FORBIDDEN,
        );
      }

      const jwtPayload = {
        sub: admin!.id,
        email: admin!.email,
        role: admin!.role,
        type: 'admin',
      };

      const jwtAccessToken = this.authService.signAdminAccessToken(jwtPayload);
      const jwtRefreshToken = this.authService.signAdminRefreshToken(jwtPayload);

      const refreshTokenHash = this.authService.hashToken(jwtRefreshToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.dbService.createAdminRefreshToken(admin!.id, refreshTokenHash, expiresAt);

      await this.dbService.updateAdminLastLogin(admin!.id);

      this.logger.log(`adminOAuthCodeExchange success adminId=${admin!.id} role=${admin!.role}`);

      return {
        accessToken: jwtAccessToken,
        refreshToken: jwtRefreshToken,
        admin: {
          id: admin!.id,
          email: admin!.email,
          name: admin!.name,
          role: admin!.role,
          organizationId: admin!.organization_id,
        },
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`adminOAuthCodeExchange failed error=${(error as Error).message}`);
      throw new HttpException(
        'OAuth 인증에 실패했습니다.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Authorization code를 access token으로 교환
   */
  private async exchangeCodeForToken(
    provider: string,
    code: string,
    redirectUri: string,
  ): Promise<string> {
    if (provider === 'kakao') {
      const clientId = process.env.KAKAO_CLIENT_ID;
      const clientSecret = process.env.KAKAO_CLIENT_SECRET;

      if (!clientId) {
        throw new Error('KAKAO_CLIENT_ID not configured');
      }

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
      });

      if (clientSecret) {
        params.append('client_secret', clientSecret);
      }

      const response = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });

      const data = await response.json();
      if (!response.ok) {
        this.logger.warn(`Kakao token exchange failed: ${JSON.stringify(data)}`);
        throw new Error(`Kakao token exchange failed: ${data.error_description || data.error}`);
      }

      return data.access_token;
    } else if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured');
      }

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        this.logger.warn(`Google token exchange failed: ${JSON.stringify(data)}`);
        throw new Error(`Google token exchange failed: ${data.error_description || data.error}`);
      }

      return data.access_token;
    }

    throw new Error(`Unknown provider: ${provider}`);
  }

  /**
   * POST /admin/auth/oauth
   * 관제 관리자 OAuth 로그인 (카카오/Google)
   */
  @Post('admin/auth/oauth')
  async adminOAuthLogin(
    @Body() body: { provider?: string; accessToken?: string },
  ) {
    const provider = body.provider?.trim().toLowerCase();
    const accessToken = body.accessToken?.trim();

    if (!provider || !accessToken) {
      throw new HttpException(
        'provider and accessToken are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (provider !== 'kakao' && provider !== 'google') {
      throw new HttpException(
        'provider must be kakao or google',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`adminOAuthLogin provider=${provider}`);

    try {
      // OAuth 토큰 검증
      const oauthUser = await this.verifyOAuthToken(provider, accessToken);

      if (!oauthUser.email) {
        throw new HttpException(
          '이메일 정보를 가져올 수 없습니다. 이메일 제공 동의가 필요합니다.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 기존 관리자 확인
      let admin = await this.dbService.findAdminByProviderId(provider, oauthUser.providerId);

      if (!admin) {
        // 이메일로 기존 관리자 확인 (다른 provider로 가입했을 수 있음)
        admin = await this.dbService.findAdminByEmail(oauthUser.email);

        if (admin) {
          // 다른 provider로 이미 가입된 경우
          throw new HttpException(
            `이미 ${admin.provider}로 가입된 계정입니다.`,
            HttpStatus.CONFLICT,
          );
        }

        // 첫 번째 관리자는 super_admin, 이후는 admin 권한 부여
        const newAdmin = await this.dbService.createAdmin({
          email: oauthUser.email,
          name: oauthUser.name,
          provider,
          providerId: oauthUser.providerId,
        });

        admin = await this.dbService.findAdminById(newAdmin.id);
      }

      // 비활성화된 관리자 확인
      if (!admin!.is_active) {
        throw new HttpException(
          '계정이 비활성화되었습니다. 관리자에게 문의하세요.',
          HttpStatus.FORBIDDEN,
        );
      }

      // JWT 토큰 발급
      const jwtPayload = {
        sub: admin!.id,
        email: admin!.email,
        role: admin!.role,
        type: 'admin',
      };

      const jwtAccessToken = this.authService.signAdminAccessToken(jwtPayload);
      const jwtRefreshToken = this.authService.signAdminRefreshToken(jwtPayload);

      // 리프레시 토큰 저장
      const refreshTokenHash = this.authService.hashToken(jwtRefreshToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30일
      await this.dbService.createAdminRefreshToken(admin!.id, refreshTokenHash, expiresAt);

      // 마지막 로그인 시간 업데이트
      await this.dbService.updateAdminLastLogin(admin!.id);

      this.logger.log(`adminOAuthLogin success adminId=${admin!.id} role=${admin!.role}`);

      return {
        accessToken: jwtAccessToken,
        refreshToken: jwtRefreshToken,
        admin: {
          id: admin!.id,
          email: admin!.email,
          name: admin!.name,
          role: admin!.role,
          organizationId: admin!.organization_id,
        },
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`adminOAuthLogin failed error=${(error as Error).message}`);
      throw new HttpException(
        'OAuth 인증에 실패했습니다.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * POST /admin/auth/refresh
   * 관제 관리자 토큰 갱신
   */
  @Post('admin/auth/refresh')
  async adminRefreshToken(
    @Body() body: { refreshToken?: string },
  ) {
    const refreshToken = body.refreshToken?.trim();

    if (!refreshToken) {
      throw new HttpException(
        'refreshToken is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const tokenHash = this.authService.hashToken(refreshToken);
      const storedToken = await this.dbService.findAdminRefreshToken(tokenHash);

      if (!storedToken) {
        throw new HttpException(
          '유효하지 않은 리프레시 토큰입니다.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const admin = await this.dbService.findAdminById(storedToken.admin_id);
      if (!admin || !admin.is_active) {
        await this.dbService.deleteAdminRefreshToken(tokenHash);
        throw new HttpException(
          '계정이 비활성화되었습니다.',
          HttpStatus.FORBIDDEN,
        );
      }

      // 기존 리프레시 토큰 삭제
      await this.dbService.deleteAdminRefreshToken(tokenHash);

      // 새 토큰 발급
      const jwtPayload = {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        type: 'admin',
      };

      const newAccessToken = this.authService.signAdminAccessToken(jwtPayload);
      const newRefreshToken = this.authService.signAdminRefreshToken(jwtPayload);

      // 새 리프레시 토큰 저장
      const newTokenHash = this.authService.hashToken(newRefreshToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.dbService.createAdminRefreshToken(admin.id, newTokenHash, expiresAt);

      this.logger.log(`adminRefreshToken success adminId=${admin.id}`);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`adminRefreshToken failed error=${(error as Error).message}`);
      throw new HttpException(
        '토큰 갱신에 실패했습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/auth/logout
   * 관제 관리자 로그아웃
   */
  @Post('admin/auth/logout')
  async adminLogout(
    @Body() body: { refreshToken?: string },
  ) {
    const refreshToken = body.refreshToken?.trim();

    if (refreshToken) {
      const tokenHash = this.authService.hashToken(refreshToken);
      await this.dbService.deleteAdminRefreshToken(tokenHash);
    }

    return { success: true };
  }

  /**
   * GET /admin/organizations
   * 조직 목록 조회
   */
  @Get('admin/organizations')
  async listOrganizations() {
    const organizations = await this.dbService.listAllOrganizations();
    return {
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
      })),
    };
  }

  /**
   * POST /admin/organizations/find-or-create
   * 조직 조회 또는 생성
   */
  @Post('admin/organizations/find-or-create')
  async findOrCreateOrganization(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { name?: string },
  ) {
    const accessToken = authorization?.replace('Bearer ', '').trim();
    const name = body.name?.trim();

    if (!accessToken) {
      throw new HttpException(
        'Authorization header is required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!name) {
      throw new HttpException(
        'name is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 토큰 검증
    try {
      this.authService.verifyAdminAccessToken(accessToken);
    } catch {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }

    const result = await this.dbService.findOrCreateOrganization(name);
    this.logger.log(`findOrCreateOrganization name=${name} created=${result.created}`);

    return {
      organization: {
        id: result.organization.id,
        name: result.organization.name,
      },
      created: result.created,
    };
  }

  /**
   * PUT /admin/me/organization
   * 관리자 조직 선택/변경
   */
  @Put('admin/me/organization')
  async updateAdminOrganization(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { organizationId?: string },
  ) {
    const accessToken = authorization?.replace('Bearer ', '').trim();
    const organizationId = body.organizationId?.trim();

    if (!accessToken) {
      throw new HttpException(
        'Authorization header is required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!organizationId) {
      throw new HttpException(
        'organizationId is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const payload = this.authService.verifyAdminAccessToken(accessToken);
      const admin = await this.dbService.findAdminById(payload.sub);

      if (!admin || !admin.is_active) {
        throw new HttpException(
          '계정을 찾을 수 없거나 비활성화되었습니다.',
          HttpStatus.FORBIDDEN,
        );
      }

      // 조직 존재 확인
      const organization = await this.dbService.findOrganization(organizationId);
      if (!organization) {
        throw new HttpException(
          '조직을 찾을 수 없습니다.',
          HttpStatus.NOT_FOUND,
        );
      }

      await this.dbService.updateAdminOrganization(admin.id, organizationId);
      this.logger.log(`updateAdminOrganization adminId=${admin.id} organizationId=${organizationId}`);

      return {
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
        },
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      throw new HttpException(
        '조직 선택에 실패했습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/me
   * 현재 관리자 정보 조회
   */
  @Get('admin/me')
  async getAdminMe(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const accessToken = authorization?.replace('Bearer ', '').trim();

    if (!accessToken) {
      throw new HttpException(
        'Authorization header is required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.authService.verifyAdminAccessToken(accessToken);
      const admin = await this.dbService.findAdminById(payload.sub);

      if (!admin || !admin.is_active) {
        throw new HttpException(
          '계정을 찾을 수 없거나 비활성화되었습니다.',
          HttpStatus.FORBIDDEN,
        );
      }

      const permissions = await this.dbService.getAdminPermissions(admin.id);

      return {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          organizationId: admin.organization_id,
          permissions,
        },
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      throw new HttpException(
        '인증에 실패했습니다.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // OAuth 토큰 검증 헬퍼
  private async verifyOAuthToken(
    provider: string,
    accessToken: string,
  ): Promise<{ providerId: string; email?: string; name?: string }> {
    if (provider === 'kakao') {
      return this.verifyKakaoToken(accessToken);
    } else if (provider === 'google') {
      return this.verifyGoogleToken(accessToken);
    }
    throw new Error(`Unknown provider: ${provider}`);
  }

  private async verifyKakaoToken(accessToken: string) {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Kakao token verification failed');
    }

    const data = await response.json();
    return {
      providerId: String(data.id),
      email: data.kakao_account?.email,
      name: data.properties?.nickname,
    };
  }

  private async verifyGoogleToken(accessToken: string) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Google token verification failed');
    }

    const data = await response.json();
    return {
      providerId: data.sub,
      email: data.email,
      name: data.name,
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private summarizeToken(token?: string) {
    if (!token) return 'none';
    const suffix = token.slice(-6);
    return `len=${token.length}..${suffix}`;
  }

  private normalizeLivekitUrl(value?: string) {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
        return undefined;
      }
      return trimmed;
    } catch {
      return undefined;
    }
  }

  private summarizePayloadKeys(payload?: Record<string, unknown>) {
    if (!payload) return 'none';
    const keys = Object.keys(payload);
    if (keys.length === 0) return 'none';
    return keys.join(',');
  }
}
