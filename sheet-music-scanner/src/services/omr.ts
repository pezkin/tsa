import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { MusicData, Measure, Note } from '@utils/types';
import { OMRService as OMRTFLiteService, OMRProcessingOptions as TFLiteOMRProcessingOptions } from './omr-tflite';

export interface OMRResponse {
  success: boolean;
  musicData?: MusicData;
  confidence?: number;
  error?: string;
  processingTime?: number;
}

export interface OMRProcessingOptions {
  enhanceImage?: boolean;
  language?: 'en' | 'es' | 'fr' | 'de';
  returnConfidence?: boolean;
  onProgress?: (message: string, progress: number) => void;
  returnDetails?: boolean;
  confidenceThreshold?: number;
}

/**
 * Optical Music Recognition Service
 * Handles integration with OMR APIs and offline TFLite processing
 */
export class OMRService {
  private static readonly CUSTOM_OMR_API = process.env.EXPO_PUBLIC_OMR_API_URL || 'https://your-omr-api.com/api/recognize';
  
  /**
   * Initialize the offline TFLite OMR service and load models
   */
  static async initialize(progressCallback?: (message: string) => void): Promise<void> {
    return OMRTFLiteService.initialize(progressCallback);
  }

  /**
   * Scan sheet music using offline TFLite models
   */
  static async scanSheetMusic(
    imagePath: string,
    options: OMRProcessingOptions = {}
  ): Promise<OMRResponse> {
    const tfliteOptions: TFLiteOMRProcessingOptions = {
      onProgress: options.onProgress,
      returnDetails: options.returnDetails,
      confidenceThreshold: options.confidenceThreshold,
    };
    return OMRTFLiteService.scanSheetMusic(imagePath, tfliteOptions);
  }

  /**
   * Process image through OMR
   * Currently uses cloud-based approach
   */
  static async processImage(
    imagePath: string,
    options: OMRProcessingOptions = {}
  ): Promise<OMRResponse> {
    try {
      const startTime = Date.now();

      // Read image file
      const imageData = await FileSystem.readAsStringAsync(imagePath, {
        encoding: FileSystem.EncodingType.Base64 as any,
      });

      // Call OMR API
      const response = await this.callOMRAPI(imageData, options);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        musicData: response.musicData,
        confidence: response.confidence,
        processingTime,
      };
    } catch (error) {
      console.error('OMR processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during OMR processing',
      };
    }
  }

  /**
   * Call OMR API (can be switched between providers)
   */
  private static async callOMRAPI(
    imageBase64: string,
    options: OMRProcessingOptions
  ): Promise<{ musicData: MusicData; confidence: number }> {
    try {
      const response = await fetch(this.CUSTOM_OMR_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OMR_API_KEY || ''}`,
        },
        body: JSON.stringify({
          image: imageBase64,
          enhance: options.enhanceImage ?? true,
          language: options.language ?? 'en',
          returnConfidence: options.returnConfidence ?? true,
        }),
      });

      if (!response.ok) {
        throw new Error(`OMR API error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseOMRResponse(data);
    } catch (error) {
      console.error('OMR API call failed:', error);
      // Fallback to mock data for development
      return this.generateMockMusicData();
    }
  }

  /**
   * Parse OMR API response and convert to MusicData
   */
  private static parseOMRResponse(apiResponse: any): { musicData: MusicData; confidence: number } {
    try {
      const measures: Measure[] = [];

      // Parse measures from API response
      if (apiResponse.measures && Array.isArray(apiResponse.measures)) {
        apiResponse.measures.forEach((measure: any, index: number) => {
          const notes: Note[] = [];

          if (measure.notes && Array.isArray(measure.notes)) {
            measure.notes.forEach((noteData: any) => {
              notes.push({
                pitch: noteData.pitch || 'C',
                octave: noteData.octave || 4,
                duration: noteData.duration || 1,
                accidental: noteData.accidental,
                dynamics: noteData.dynamics,
                articulation: noteData.articulation,
              });
            });
          }

          measures.push({
            number: index + 1,
            timeSignature: measure.timeSignature || '4/4',
            notes,
            duration: measure.duration,
          });
        });
      }

      const musicData: MusicData = {
        title: apiResponse.title || 'Untitled Score',
        composer: apiResponse.composer || 'Unknown Composer',
        timeSignature: apiResponse.timeSignature || '4/4',
        tempo: apiResponse.tempo || 120,
        key: apiResponse.key || 'C major',
        measures,
        pages: apiResponse.pages || 1,
        currentPage: 1,
      };

      const confidence = apiResponse.confidence || 0.85;

      return { musicData, confidence };
    } catch (error) {
      console.error('Error parsing OMR response:', error);
      return this.generateMockMusicData();
    }
  }

  /**
   * Generate mock music data for development/testing
   */
  static generateMockMusicData(): { musicData: MusicData; confidence: number } {
    const mockNotes: Note[] = [
      { pitch: 'C', octave: 4, duration: 1, accidental: undefined },
      { pitch: 'D', octave: 4, duration: 1, accidental: undefined },
      { pitch: 'E', octave: 4, duration: 1, accidental: undefined },
      { pitch: 'F', octave: 4, duration: 1, accidental: undefined },
    ];

    const musicData: MusicData = {
      title: 'Mock Score',
      composer: 'Tsali Scanner',
      timeSignature: '4/4',
      tempo: 120,
      key: 'C major',
      measures: [
        {
          number: 1,
          timeSignature: '4/4',
          notes: mockNotes,
          duration: 4,
        },
        {
          number: 2,
          timeSignature: '4/4',
          notes: mockNotes.map(n => ({ ...n, pitch: 'G' })),
          duration: 4,
        },
      ],
      pages: 1,
      currentPage: 1,
    };

    return { musicData, confidence: 0.75 };
  }

  /**
   * Validate and correct music data
   */
  static validateMusicData(musicData: MusicData): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!musicData.measures || musicData.measures.length === 0) {
      errors.push('No measures found in music data');
    }

    // Validate each measure
    musicData.measures?.forEach((measure, index) => {
      if (!measure.notes || measure.notes.length === 0) {
        warnings.push(`Measure ${index + 1} has no notes`);
      }

      measure.notes.forEach((note, noteIndex) => {
        if (!note.pitch) {
          errors.push(`Measure ${index + 1}, Note ${noteIndex + 1}: Missing pitch`);
        }
        if (note.octave === undefined || note.octave < 0 || note.octave > 8) {
          errors.push(`Measure ${index + 1}, Note ${noteIndex + 1}: Invalid octave`);
        }
        if (note.duration <= 0) {
          errors.push(`Measure ${index + 1}, Note ${noteIndex + 1}: Invalid duration`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Enhance image before OMR processing
   */
  static async enhanceImage(imagePath: string): Promise<string> {
    try {
      // This would use image processing library
      // For now, return original path
      // In production, use react-native-image-manipulator or similar
      return imagePath;
    } catch (error) {
      console.error('Image enhancement error:', error);
      throw error;
    }
  }

  /**
   * Estimate processing time based on image size
   */
  static estimateProcessingTime(imageWidth: number, imageHeight: number): number {
    // Rough estimation: larger images take longer
    const pixels = imageWidth * imageHeight;
    const baseTime = 2000; // 2 seconds base
    const timePerMegapixel = 1000; // 1 second per megapixel
    const megapixels = pixels / 1000000;

    return Math.round(baseTime + megapixels * timePerMegapixel);
  }

  /**
   * Get confidence score explanation
   */
  static getConfidenceExplanation(confidence: number): string {
    if (confidence >= 0.9) return 'Very high confidence';
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.7) return 'Good confidence';
    if (confidence >= 0.6) return 'Moderate confidence';
    return 'Low confidence - manual review recommended';
  }

  /**
   * Correct note data manually
   */
  static correctNote(
    musicData: MusicData,
    measureIndex: number,
    noteIndex: number,
    correction: Partial<Note>
  ): MusicData {
    const corrected = JSON.parse(JSON.stringify(musicData)) as MusicData;

    if (
      corrected.measures &&
      corrected.measures[measureIndex] &&
      corrected.measures[measureIndex].notes[noteIndex]
    ) {
      corrected.measures[measureIndex].notes[noteIndex] = {
        ...corrected.measures[measureIndex].notes[noteIndex],
        ...correction,
      };
    }

    return corrected;
  }
}

export default OMRService;
