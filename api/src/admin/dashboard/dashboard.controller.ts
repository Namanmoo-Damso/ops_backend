import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DashboardRepository } from '../../database/repositories';

@Controller('v1/admin/dashboard')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardRepository: DashboardRepository) {}

  @Get('stats')
  async getStats() {
    this.logger.log('getStats called');

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
        this.dashboardRepository.getOverview(),
        this.dashboardRepository.getTodayStats(),
        this.dashboardRepository.getWeeklyTrend(),
        this.dashboardRepository.getMoodDistribution(),
        this.dashboardRepository.getHealthAlertsSummary(),
        this.dashboardRepository.getTopHealthKeywords(10),
        this.dashboardRepository.getOrganizationStats(),
        this.dashboardRepository.getRecentActivity(20),
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
      this.logger.warn(`getStats failed error=${(error as Error).message}`);
      throw new HttpException('Failed to fetch dashboard stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('realtime')
  async getRealtime() {
    this.logger.log('getRealtime called');

    try {
      const [realtime, recentActivity] = await Promise.all([
        this.dashboardRepository.getRealtimeStats(),
        this.dashboardRepository.getRecentActivity(10),
      ]);

      return {
        ...realtime,
        recentActivity,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(`getRealtime failed error=${(error as Error).message}`);
      throw new HttpException('Failed to fetch realtime stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
