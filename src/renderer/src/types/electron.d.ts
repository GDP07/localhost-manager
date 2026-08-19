import { localhostManagerAPI } from '../../../preload/index';

declare global {
  interface Window {
    localhostManagerAPI: typeof localhostManagerAPI;
  }
}

export {};
