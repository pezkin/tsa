// Type Definitions
export interface ScannedItem {
  id: string;
  filename: string;
  imagePath: string;
  thumbnail: string;
  musicData?: MusicData;
  dateScanned: number;
  lastPlayed?: number;
  playCount: number;
  duration?: number;
  notes?: string;
  processingTime?: number;
  confidence?: number;
}

export interface MusicData {
  title?: string;
  composer?: string;
  timeSignature?: string;
  tempo?: number;
  key?: string;
  measures?: Measure[];
  pages?: number;
  currentPage?: number;
  confidence?: number;
  noteCount?: number;
}

export interface Measure {
  number: number;
  timeSignature?: string;
  notes: Note[];
  duration?: number;
}

export interface Note {
  pitch: string;
  duration: number;
  octave: number;
  accidental?: 'sharp' | 'flat' | 'natural';
  dynamics?: string;
  articulation?: string;
  confidence?: number;
}

export interface AppSettings {
  vibration: boolean;
  haptics: boolean;
  soundEnabled: boolean;
  autoRotate: boolean;
  theme: 'light' | 'dark';
  volume: number;
  playbackSpeed: number;
  metronomeEnabled: boolean;
  instrumentType: string;
}

export interface CameraPermission {
  status: 'granted' | 'denied' | 'undetermined';
  expires: 'never' | number;
  canAskAgain?: boolean;
  granted?: boolean;
}

export interface FileOperationProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  message: string;
}

export interface AudioPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  loop: boolean;
  metronomeEnabled: boolean;
}

export interface NavigationParams {
  Home: undefined;
  Scanner: undefined;
  Viewer: { itemId: string };
  Library: undefined;
  Settings: undefined;
  Help: undefined;
}

export type RootStackParamList = NavigationParams;
