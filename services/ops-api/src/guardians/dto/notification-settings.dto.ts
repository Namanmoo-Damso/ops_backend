export class UpdateNotificationSettingsDto {
  callReminder?: boolean;
  callComplete?: boolean;
  healthAlert?: boolean;
}

export class NotificationSettingsResponseDto {
  callReminder: boolean;
  callComplete: boolean;
  healthAlert: boolean;
}
