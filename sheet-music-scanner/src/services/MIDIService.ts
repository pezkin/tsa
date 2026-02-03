import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

interface PlaybackInfo {
  isPlaying: boolean;
  currentPosition: number;
  duration: number;
  speed: number;
}

interface PlaybackStatusCallback {
  (info: PlaybackInfo): void;
}

export class MIDIService {
  private sound: Audio.Sound | null = null;
  private isPlaying = false;
  private currentPosition = 0;
  private duration = 0;
  private speed = 1;
  private statusCallbacks: Set<PlaybackStatusCallback> = new Set();

  /**
   * Load MIDI from base64 encoded data
   */
  async loadMIDI(base64MIDIData: string): Promise<void> {
    try {
      // Cleanup previous sound if any
      await this.cleanup();

      // Decode base64 to binary
      const binaryString = atob(base64MIDIData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Save to cache directory - use FileSystem.Paths.cache
      const cacheDir = FileSystem.Paths.cache;
      const tempPath = `${cacheDir}/temp_${Date.now()}.mid`;
      const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      
      await FileSystem.writeAsStringAsync(tempPath, base64, {
        encoding: 'base64' as any,
      });

      // Load audio with expo-av
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempPath },
        { shouldPlay: false }
      );
      
      this.sound = sound;

      // Get duration
      const status = await sound.getStatusAsync();
      if ((status as any).isLoaded) {
        this.duration = (status as any).durationMillis || 0;
      }

      // Setup position tracking listener
      this.setupPlaybackListener();
    } catch (error) {
      console.error('MIDI loading failed:', error);
      throw error;
    }
  }

  /**
   * Setup listener for playback status updates
   */
  private setupPlaybackListener(): void {
    if (!this.sound) return;

    // Use setOnPlaybackStatusUpdate instead of addPlaybackStatusUpdate
    this.sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.isLoaded) {
        this.currentPosition = status.positionMillis || 0;
        this.isPlaying = status.isPlaying || false;

        // Notify all subscribers
        this.notifyStatusChange();
      }
    });
  }

  /**
   * Notify all registered callbacks of status changes
   */
  private notifyStatusChange(): void {
    const info: PlaybackInfo = {
      isPlaying: this.isPlaying,
      currentPosition: this.currentPosition,
      duration: this.duration,
      speed: this.speed,
    };

    this.statusCallbacks.forEach((callback) => {
      try {
        callback(info);
      } catch (error) {
        console.error('Error in playback callback:', error);
      }
    });
  }

  /**
   * Play the loaded MIDI
   */
  async play(): Promise<void> {
    if (!this.sound) throw new Error('No MIDI loaded');
    try {
      await this.sound.playAsync();
      this.isPlaying = true;
      this.notifyStatusChange();
    } catch (error) {
      console.error('Play error:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.sound) throw new Error('No MIDI loaded');
    try {
      await this.sound.pauseAsync();
      this.isPlaying = false;
      this.notifyStatusChange();
    } catch (error) {
      console.error('Pause error:', error);
      throw error;
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (!this.sound) throw new Error('No MIDI loaded');
    try {
      await this.sound.playAsync();
      this.isPlaying = true;
      this.notifyStatusChange();
    } catch (error) {
      console.error('Resume error:', error);
      throw error;
    }
  }

  /**
   * Stop playback and reset position
   */
  async stop(): Promise<void> {
    if (!this.sound) throw new Error('No MIDI loaded');
    try {
      await this.sound.stopAsync();
      await this.sound.setPositionAsync(0);
      this.isPlaying = false;
      this.currentPosition = 0;
      this.notifyStatusChange();
    } catch (error) {
      console.error('Stop error:', error);
      throw error;
    }
  }

  /**
   * Seek to specific position in milliseconds
   */
  async seek(positionMs: number): Promise<void> {
    if (!this.sound) throw new Error('No MIDI loaded');
    try {
      const clampedPosition = Math.max(0, Math.min(positionMs, this.duration));
      await this.sound.setPositionAsync(clampedPosition);
      this.currentPosition = clampedPosition;
      this.notifyStatusChange();
    } catch (error) {
      console.error('Seek error:', error);
      throw error;
    }
  }

  /**
   * Set playback speed
   */
  async setPlaybackSpeed(speed: number): Promise<void> {
    if (!this.sound) throw new Error('No MIDI loaded');
    try {
      // Clamp speed between 0.5 and 2.0
      const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
      await this.sound.setRateAsync(clampedSpeed, true);
      this.speed = clampedSpeed;
      this.notifyStatusChange();
    } catch (error) {
      console.error('Speed error:', error);
      throw error;
    }
  }

  /**
   * Get current playback info
   */
  getPlaybackInfo(): PlaybackInfo {
    return {
      isPlaying: this.isPlaying,
      currentPosition: this.currentPosition,
      duration: this.duration,
      speed: this.speed,
    };
  }

  /**
   * Subscribe to playback status updates
   */
  onStatusChange(callback: PlaybackStatusCallback): () => void {
    this.statusCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Get duration in milliseconds
   */
  getDuration(): number {
    return this.duration;
  }

  /**
   * Get current position in milliseconds
   */
  getCurrentPosition(): number {
    return this.currentPosition;
  }

  /**
   * Check if MIDI is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current playback speed
   */
  getPlaybackSpeed(): number {
    return this.speed;
  }

  /**
   * Cleanup and unload MIDI
   */
  async cleanup(): Promise<void> {
    try {
      // Unload and cleanup sound
      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }

      // Reset state
      this.isPlaying = false;
      this.currentPosition = 0;
      this.duration = 0;
      this.speed = 1;
      this.statusCallbacks.clear();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Get human-readable time format
   */
  static formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

export default MIDIService;
