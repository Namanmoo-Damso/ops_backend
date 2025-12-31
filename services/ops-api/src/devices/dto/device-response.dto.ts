export class DeviceInfoDto {
  id: string;
  platform: string;
  hasApnsToken: boolean;
  hasVoipToken: boolean;
  supportsCallKit: boolean;
  env: string;
  lastSeen: string;
}

export class UserInfoDto {
  id: string;
  identity: string;
  displayName: string | null;
}

export class DeviceResponseDto {
  user: UserInfoDto;
  device?: DeviceInfoDto;
}
