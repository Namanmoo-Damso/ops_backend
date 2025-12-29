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
} from '@nestjs/common';
import { AppService } from './app.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
    private readonly dbService: DbService,
  ) {}

  @Get('/healthz')
  getHealth() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Post('/webhook/kakao/unlink')
  async kakaoUnlink(
    @Body() body: { user_id?: string; referrer_type?: string },
  ) {
    const kakaoId = body.user_id?.trim();
    const referrerType = body.referrer_type ?? 'unknown';

    if (!kakaoId) {
      // 카카오 웹훅은 반드시 200 응답해야 함
      this.logger.warn('kakaoUnlink missing user_id');
      return { success: true };
    }

    this.logger.log(`kakaoUnlink kakaoId=${kakaoId} type=${referrerType}`);

    try {
      const user = await this.dbService.findUserByKakaoId(kakaoId);
      if (!user) {
        // 이미 탈퇴했거나 없는 사용자
        this.logger.log(`kakaoUnlink user not found kakaoId=${kakaoId}`);
        return { success: true };
      }

      await this.dbService.deleteUser(user.id);
      this.logger.log(`kakaoUnlink deleted userId=${user.id}`);

      return { success: true };
    } catch (error) {
      // 웹훅은 에러가 나도 200 응답
      this.logger.error(`kakaoUnlink failed kakaoId=${kakaoId} error=${(error as Error).message}`);
      return { success: true };
    }
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
    return await this.appService.endCall(callId);
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
