import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

export interface PlatformStatus {
  name: string;
  serverTime: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly http = inject(HttpClient);

  status() {
    return this.http.get<PlatformStatus>('/api/platform');
  }
}
