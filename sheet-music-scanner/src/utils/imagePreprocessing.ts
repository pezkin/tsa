/**
 * Image Preprocessing Utilities
 * 
 * Functions for preparing sheet music images for TensorFlow Lite inference:
 * - Resizing and normalization
 * - Pixel extraction from images
 * - Grayscale conversion
 * - Enhancement filters
 */

import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync } from 'expo-image-manipulator';

/**
 * Resize image to target dimensions
 */
export async function resizeImage(
  imageUri: string,
  targetWidth: number,
  targetHeight: number
): Promise<{
  uri: string;
  width: number;
  height: number;
  base64?: string;
}> {
  try {
    const result = await manipulateAsync(
      imageUri,
      [{ resize: { width: targetWidth, height: targetHeight } }],
      { format: 'jpeg', compress: 0.9 }
    );

    return {
      uri: result.uri,
      width: targetWidth,
      height: targetHeight,
    };
  } catch (error) {
    console.error('Image resize error:', error);
    throw error;
  }
}

/**
 * Convert image to grayscale
 */
export async function toGrayscale(imageUri: string): Promise<string> {
  try {
    // Note: expo-image-manipulator doesn't have direct grayscale filter
    // This is a placeholder - in production, use native image processing
    // via react-native-vision-camera or similar
    return imageUri;
  } catch (error) {
    console.error('Grayscale conversion error:', error);
    throw error;
  }
}

/**
 * Normalize pixel values from [0, 255] to [0, 1]
 */
export function normalizePixels(
  pixels: Uint8Array,
  min: number = 0,
  max: number = 255
): Float32Array {
  const normalized = new Float32Array(pixels.length);

  for (let i = 0; i < pixels.length; i++) {
    normalized[i] = (pixels[i] - min) / (max - min);
  }

  return normalized;
}

/**
 * Denormalize pixel values from [0, 1] to [0, 255]
 */
export function denormalizePixels(
  pixels: Float32Array,
  min: number = 0,
  max: number = 255
): Uint8Array {
  const denormalized = new Uint8Array(pixels.length);

  for (let i = 0; i < pixels.length; i++) {
    denormalized[i] = Math.round(pixels[i] * (max - min) + min);
  }

  return denormalized;
}

/**
 * Extract RGB pixels from image file as Float32Array
 * 
 * IMPORTANT: This is a placeholder implementation.
 * Production version requires native image decoding:
 * - Android: BitmapFactory.decodeFile() → getPixels()
 * - iOS: UIImage → CIImage → pixel data via Core Graphics
 * 
 * Alternative: Use react-native-vision-camera or similar native library
 */
export async function extractImagePixels(
  imageUri: string,
  width: number = 512,
  height: number = 512,
  channels: number = 3
): Promise<Uint8Array> {
  try {
    // Read image as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64 as any,
    });

    // Decode base64 to binary
    const binaryString = atob(base64);
    const pixels = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      pixels[i] = binaryString.charCodeAt(i);
    }

    // TODO: Proper image decoding
    // For now, return placeholder with correct dimensions
    const pixelCount = width * height * channels;
    const placeholderPixels = new Uint8Array(pixelCount);

    // Initialize with mid-gray values
    for (let i = 0; i < pixelCount; i++) {
      placeholderPixels[i] = 128;
    }

    return placeholderPixels;
  } catch (error) {
    console.error('Pixel extraction error:', error);
    throw error;
  }
}

/**
 * Complete image preprocessing pipeline
 * 1. Resize to target dimensions
 * 2. Extract pixels
 * 3. Normalize to [0, 1]
 * 4. Return as Float32Array (NHWC format for TFLite)
 */
export async function preprocessImage(
  imageUri: string,
  targetWidth: number = 512,
  targetHeight: number = 512
): Promise<{
  pixels: Float32Array;
  width: number;
  height: number;
}> {
  try {
    console.log(`Preprocessing image: ${targetWidth}×${targetHeight}`);

    // 1. Resize
    const resized = await resizeImage(imageUri, targetWidth, targetHeight);
    console.log(`✅ Resized to ${resized.width}×${resized.height}`);

    // 2. Extract pixels
    const pixelData = await extractImagePixels(
      resized.uri,
      targetWidth,
      targetHeight,
      3 // RGB
    );
    console.log(`✅ Extracted ${pixelData.length} pixels`);

    // 3. Normalize
    const normalized = normalizePixels(pixelData);
    console.log(`✅ Normalized pixels to [0, 1]`);

    return {
      pixels: normalized,
      width: targetWidth,
      height: targetHeight,
    };
  } catch (error) {
    console.error('Image preprocessing failed:', error);
    throw error;
  }
}

/**
 * Enhance image for better OMR recognition
 * Applies:
 * - Contrast enhancement
 * - Brightness adjustment
 * - Sharpening
 */
export async function enhanceImage(
  imageUri: string,
  options: {
    contrast?: number;      // 0.5 - 2.0 (default 1.0)
    brightness?: number;    // -1.0 - 1.0 (default 0)
    sharpness?: number;     // 0.0 - 2.0 (default 1.0)
  } = {}
): Promise<string> {
  try {
    const actions = [];

    // Note: expo-image-manipulator has limited filters
    // In production, use native image processing for advanced effects

    const result = await manipulateAsync(imageUri, actions, {
      format: 'jpeg',
      compress: 0.9,
    });

    return result.uri;
  } catch (error) {
    console.error('Image enhancement error:', error);
    return imageUri; // Return original on error
  }
}

/**
 * Crop region from image
 */
export async function cropImage(
  imageUri: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<string> {
  try {
    const result = await manipulateAsync(
      imageUri,
      [
        {
          crop: {
            originX: x,
            originY: y,
            width,
            height,
          },
        },
      ],
      { format: 'jpeg', compress: 0.9 }
    );

    return result.uri;
  } catch (error) {
    console.error('Image crop error:', error);
    throw error;
  }
}

/**
 * Rotate image
 */
export async function rotateImage(
  imageUri: string,
  degrees: number
): Promise<string> {
  try {
    const result = await manipulateAsync(
      imageUri,
      [{ rotate: degrees }],
      { format: 'jpeg', compress: 0.9 }
    );

    return result.uri;
  } catch (error) {
    console.error('Image rotation error:', error);
    throw error;
  }
}

/**
 * Flip image (horizontal)
 */
export async function flipImage(imageUri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      imageUri,
      [{ flip: { vertical: false, horizontal: true } }],
      { format: 'jpeg', compress: 0.9 }
    );

    return result.uri;
  } catch (error) {
    console.error('Image flip error:', error);
    throw error;
  }
}

/**
 * Calculate image dimensions
 */
export async function getImageDimensions(imageUri: string): Promise<{
  width: number;
  height: number;
}> {
  try {
    // This requires native implementation
    // For now, return placeholder
    return { width: 1920, height: 1440 };
  } catch (error) {
    console.error('Error getting image dimensions:', error);
    throw error;
  }
}

/**
 * Validate image quality for OMR
 */
export async function validateImageQuality(
  imageUri: string
): Promise<{
  valid: boolean;
  issues: string[];
  suggestions: string[];
}> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  try {
    const dimensions = await getImageDimensions(imageUri);

    // Check minimum resolution
    if (dimensions.width < 512 || dimensions.height < 512) {
      issues.push('Image resolution too low for accurate OMR');
      suggestions.push('Use a higher resolution image (at least 512×512)');
    }

    // Check aspect ratio (assume portrait for sheet music)
    const aspectRatio = dimensions.width / dimensions.height;
    if (aspectRatio > 0.8) {
      suggestions.push('Consider adjusting orientation for better results');
    }

    return {
      valid: issues.length === 0,
      issues,
      suggestions,
    };
  } catch (error) {
    console.error('Image validation error:', error);
    return {
      valid: false,
      issues: ['Could not validate image'],
      suggestions: ['Try a different image'],
    };
  }
}
