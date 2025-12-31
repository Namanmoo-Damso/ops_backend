export class UpdateLocationDto {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string;
}

export class LocationResponseDto {
  success: boolean;
  message: string;
}
