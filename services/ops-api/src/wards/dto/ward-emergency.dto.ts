export class TriggerEmergencyDto {
  type: string;
  message?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}

export class EmergencyResponseDto {
  success: boolean;
  message: string;
  type: string;
}
