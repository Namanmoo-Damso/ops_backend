export class RegisterDeviceDto {
  identity?: string;
  displayName?: string;
  platform?: string;
  env?: 'prod' | 'sandbox';
  apnsToken?: string;
  voipToken?: string;
  supportsCallKit?: boolean;
}
