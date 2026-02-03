import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { MusicData, Note } from '@utils/types';
import { v4 as uuidv4 } from 'uuid';

export type ExportFormat = 'midi' | 'musicxml' | 'json';

interface ExportOptions {
  format: ExportFormat;
  quality?: 'low' | 'medium' | 'high';
  filename?: string;
}

export class ExportService {
  /**
   * Export music data to MIDI format
   */
  static async exportToMIDI(musicData: MusicData, filename: string = 'score.mid'): Promise<string> {
    try {
      const midiBuffer = this.generateMIDI(musicData);
      const filepath = `${FileSystem.cacheDirectory}${filename}`;
      
      // Write base64 encoded MIDI
      const base64 = this.bufferToBase64(midiBuffer);
      await FileSystem.writeAsStringAsync(filepath, base64, {
        encoding: FileSystem.EncodingType.Base64 as any,
      });

      return filepath;
    } catch (error) {
      console.error('MIDI export error:', error);
      throw new Error('Failed to export MIDI');
    }
  }

  /**
   * Export music data to MusicXML format
   */
  static async exportToMusicXML(musicData: MusicData, filename: string = 'score.musicxml'): Promise<string> {
    try {
      const xmlContent = this.generateMusicXML(musicData);
      const filepath = `${FileSystem.cacheDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(filepath, xmlContent);
      return filepath;
    } catch (error) {
      console.error('MusicXML export error:', error);
      throw new Error('Failed to export MusicXML');
    }
  }

  /**
   * Export music data as JSON
   */
  static async exportToJSON(musicData: MusicData, filename: string = 'score.json'): Promise<string> {
    try {
      const filepath = `${FileSystem.cacheDirectory}${filename}`;
      const jsonString = JSON.stringify(musicData, null, 2);
      
      await FileSystem.writeAsStringAsync(filepath, jsonString);
      return filepath;
    } catch (error) {
      console.error('JSON export error:', error);
      throw new Error('Failed to export JSON');
    }
  }

  /**
   * Generic export function
   */
  static async export(musicData: MusicData, options: ExportOptions): Promise<string> {
    const filename = options.filename || this.generateFilename(options.format);

    switch (options.format) {
      case 'midi':
        return this.exportToMIDI(musicData, filename);
      case 'musicxml':
        return this.exportToMusicXML(musicData, filename);
      case 'json':
        return this.exportToJSON(musicData, filename);
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  /**
   * Share exported file
   */
  static async shareFile(filepath: string): Promise<void> {
    try {
      const fileExists = await FileSystem.getInfoAsync(filepath);
      if (!fileExists.exists) {
        throw new Error('File does not exist');
      }

      await Sharing.shareAsync(filepath, {
        mimeType: 'application/*',
        dialogTitle: 'Share Score',
      });
    } catch (error) {
      console.error('Share error:', error);
      throw new Error('Failed to share file');
    }
  }

  /**
   * Generate MIDI file from music data
   * Returns binary data as Uint8Array
   */
  private static generateMIDI(musicData: MusicData): Uint8Array {
    // MIDI Header
    const header = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // Header length
      0x00, 0x00, // Format type 0
      0x00, 0x01, // Number of tracks
      0x00, 0x60, // Division (96 ticks per quarter note)
    ]);

    // Track data
    const trackData = this.generateMIDITrackData(musicData);
    
    // Track header
    const trackHeader = new Uint8Array([
      0x4d, 0x54, 0x72, 0x6b, // "MTrk"
      ...this.intToBytes(trackData.length),
    ]);

    // Combine all parts
    const result = new Uint8Array(header.length + trackHeader.length + trackData.length);
    result.set(header);
    result.set(trackHeader, header.length);
    result.set(trackData, header.length + trackHeader.length);

    return result;
  }

  /**
   * Generate MIDI track data from notes
   */
  private static generateMIDITrackData(musicData: MusicData): Uint8Array {
    const data: number[] = [];

    // Set tempo (microseconds per quarter note)
    const tempo = musicData.tempo || 120;
    const microsecondsPerQuarter = Math.round(60000000 / tempo);
    data.push(0x00, 0xff, 0x51, 0x03);
    data.push((microsecondsPerQuarter >> 16) & 0xff);
    data.push((microsecondsPerQuarter >> 8) & 0xff);
    data.push(microsecondsPerQuarter & 0xff);

    // Add notes from all measures
    let time = 0;
    if (musicData.measures) {
      for (const measure of musicData.measures) {
        for (const note of measure.notes) {
          // Note on
          const midi = this.noteToMIDI(note);
          const deltaTime = this.durationToTicks(note.duration);
          
          data.push(...this.encodeVariableLength(deltaTime));
          data.push(0x90, midi, 100); // Channel 1, velocity 100

          // Note off
          data.push(...this.encodeVariableLength(deltaTime));
          data.push(0x80, midi, 0);
        }
      }
    }

    // End of track
    data.push(0x00, 0xff, 0x2f, 0x00);

    return new Uint8Array(data);
  }

  /**
   * Convert note to MIDI number
   */
  private static noteToMIDI(note: Note): number {
    const noteNames: { [key: string]: number } = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
    };

    let midiNumber = (note.octave + 1) * 12 + (noteNames[note.pitch] || 0);

    if (note.accidental === 'sharp') midiNumber += 1;
    if (note.accidental === 'flat') midiNumber -= 1;

    return Math.max(0, Math.min(127, midiNumber));
  }

  /**
   * Convert note duration to MIDI ticks
   */
  private static durationToTicks(duration: number): number {
    // Assuming duration is in quarters (1 = quarter note)
    return Math.round(duration * 96);
  }

  /**
   * Encode variable length quantity for MIDI
   */
  private static encodeVariableLength(value: number): number[] {
    const bytes: number[] = [];
    let val = value;

    bytes.unshift(val & 0x7f);
    while ((val >>= 7) > 0) {
      bytes.unshift((val & 0x7f) | 0x80);
    }

    return bytes;
  }

  /**
   * Generate MusicXML from music data
   */
  private static generateMusicXML(musicData: MusicData): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
    xml += '<score-partwise version="4.0">\n';

    // Work
    xml += '  <work>\n';
    xml += `    <work-title>${this.escapeXML(musicData.title || 'Untitled')}</work-title>\n`;
    xml += '  </work>\n';

    // Movement
    xml += '  <movement-title/>\n';

    // Identification
    xml += '  <identification>\n';
    xml += '    <encoding>\n';
    xml += `      <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>\n`;
    xml += '      <software>Tsali Scanner</software>\n';
    xml += '    </encoding>\n';
    xml += '  </identification>\n';

    // Part list
    xml += '  <part-list>\n';
    xml += '    <score-part id="P1">\n';
    xml += `      <part-name>${this.escapeXML(musicData.composer || 'Unknown')}</part-name>\n`;
    xml += '    </score-part>\n';
    xml += '  </part-list>\n';

    // Part
    xml += '  <part id="P1">\n';

    if (musicData.measures) {
      for (const measure of musicData.measures) {
        xml += '    <measure number="' + measure.number + '">\n';

        // Attributes
        xml += '      <attributes>\n';
        xml += '        <divisions>4</divisions>\n';
        xml += `        <time><beats>${measure.timeSignature?.split('/')[0] || '4'}</beats><beat-type>${measure.timeSignature?.split('/')[1] || '4'}</beat-type></time>\n`;
        xml += '      </attributes>\n';

        // Notes
        for (const note of measure.notes) {
          xml += '      <note>\n';
          xml += `        <pitch><step>${note.pitch}</step><octave>${note.octave}</octave></pitch>\n`;
          xml += `        <duration>${Math.round(note.duration * 4)}</duration>\n`;
          xml += `        <type>${this.durationToNotationType(note.duration)}</type>\n`;
          xml += '      </note>\n';
        }

        xml += '    </measure>\n';
      }
    }

    xml += '  </part>\n';
    xml += '</score-partwise>\n';

    return xml;
  }

  /**
   * Convert duration to MusicXML note type
   */
  private static durationToNotationType(duration: number): string {
    if (duration === 4) return 'whole';
    if (duration === 2) return 'half';
    if (duration === 1) return 'quarter';
    if (duration === 0.5) return 'eighth';
    if (duration === 0.25) return 'sixteenth';
    return 'quarter';
  }

  /**
   * Escape XML special characters
   */
  private static escapeXML(str: string): string {
    return str.replace(/[<>&'"]/g, (char) => {
      const escapeMap: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      };
      return escapeMap[char] || char;
    });
  }

  /**
   * Convert integer to 4-byte big-endian representation
   */
  private static intToBytes(num: number): number[] {
    return [
      (num >> 24) & 0xff,
      (num >> 16) & 0xff,
      (num >> 8) & 0xff,
      num & 0xff,
    ];
  }

  /**
   * Convert Uint8Array to base64
   */
  private static bufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  /**
   * Generate filename with timestamp
   */
  private static generateFilename(format: ExportFormat): string {
    const timestamp = new Date().toISOString().slice(0, 10);
    const extension: { [key: string]: string } = {
      midi: 'mid',
      musicxml: 'musicxml',
      json: 'json',
    };
    return `score-${timestamp}.${extension[format]}`;
  }

  /**
   * Get estimated file size for format
   */
  static getEstimatedFileSize(musicData: MusicData, format: ExportFormat): string {
    const noteCount = musicData.measures?.reduce((sum, m) => sum + m.notes.length, 0) || 0;
    
    let bytes = 0;
    switch (format) {
      case 'midi':
        bytes = 100 + noteCount * 12; // Rough estimate
        break;
      case 'musicxml':
        bytes = 200 + noteCount * 150; // Rough estimate
        break;
      case 'json':
        bytes = JSON.stringify(musicData).length;
        break;
    }

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

export default ExportService;
