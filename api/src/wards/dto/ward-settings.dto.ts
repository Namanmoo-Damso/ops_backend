export class WardSettingsDto {
  aiPersona?: string;
  weeklyCallCount?: number;
  callDurationMinutes?: number;
}

export class WardSettingsResponseDto {
  aiPersona: string | null;
  weeklyCallCount: number;
  callDurationMinutes: number;
  notificationSettings: {
    callReminder: boolean;
    callComplete: boolean;
    healthAlert: boolean;
  };
}
