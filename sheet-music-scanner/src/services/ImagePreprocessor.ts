/**
 * Image Preprocessing Service
 * Processes images for OCR model input (24x24 grayscale patches)
 */

import * as tf from '@tensorflow/tfjs';
import * as ImageManipulator from 'expo-image-manipulator';

export interface ImagePatch {
  data: tf.Tensor;
  x: number; // Position in original image
  y: number;
  confidence: number; // Confidence that patch contains a note
}

export interface PreprocessingConfig {
  patchSize: number;
  grayscale: boolean;
  normalize: boolean;
  stride: number; // Step size for sliding window
}

export class ImagePreprocessor {
  private config: PreprocessingConfig;

  constructor(config?: Partial<PreprocessingConfig>) {
    this.config = {
      patchSize: 24,
      grayscale: true,
      normalize: true,
      stride: 12, // 50% overlap
      ...config,
    };
  }

  /**
   * Process image from URI and extract patches
   */
  async processImageURI(imageURI: string): Promise<ImagePatch[]> {
    try {
      // Get image data
      const imageData = await this.loadImageData(imageURI);

      // Extract patches
      const patches = await this.extractPatches(imageData);

      return patches;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }

  /**
   * Load image from URI and return raw pixel data
   */
  private async loadImageData(
    imageURI: string
  ): Promise<{
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }> {
    try {
      // For now, return a placeholder
      // In production, use expo-image-manipulator or react-native-vision-camera
      const response = await fetch(imageURI);
      const blob = await response.blob();

      // Create canvas context (for web) or use native implementation
      const canvas = new OffscreenCanvas(1024, 768);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      const image = await createImageBitmap(blob);
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        data: imageData.data,
        width: canvas.width,
        height: canvas.height,
      };
    } catch (error) {
      console.error('Error loading image data:', error);
      throw error;
    }
  }

  /**
   * Extract 24x24 patches from image using sliding window
   */
  private async extractPatches(imageData: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }): Promise<ImagePatch[]> {
    const patches: ImagePatch[] = [];
    const { data, width, height } = imageData;
    const { patchSize, stride, grayscale, normalize } = this.config;

    // Sliding window extraction
    for (let y = 0; y <= height - patchSize; y += stride) {
      for (let x = 0; x <= width - patchSize; x += stride) {
        // Extract patch
        const patchData = new Float32Array(patchSize * patchSize);

        for (let py = 0; py < patchSize; py++) {
          for (let px = 0; px < patchSize; px++) {
            const pixelIndex = ((y + py) * width + (x + px)) * 4;

            if (grayscale) {
              // Convert RGBA to grayscale
              const r = data[pixelIndex];
              const g = data[pixelIndex + 1];
              const b = data[pixelIndex + 2];
              const gray = 0.299 * r + 0.587 * g + 0.114 * b;

              patchData[py * patchSize + px] = normalize ? gray / 255 : gray;
            } else {
              // Use red channel
              patchData[py * patchSize + px] = normalize
                ? data[pixelIndex] / 255
                : data[pixelIndex];
            }
          }
        }

        // Create tensor and calculate confidence
        const tensor = tf.tensor2d(patchData, [patchSize, patchSize]);
        const confidence = this.calculatePatchConfidence(tensor);

        patches.push({
          data: tensor,
          x,
          y,
          confidence,
        });
      }
    }

    return patches;
  }

  /**
   * Calculate confidence that patch contains a note (edge detection)
   */
  private calculatePatchConfidence(tensor: tf.Tensor): number {
    try {
      // Simple edge detection: calculate variance
      const mean = tensor.mean().dataSync()[0];
      const centered = tf.sub(tensor, mean);
      const squared = tf.square(centered);
      const variance = squared.mean().dataSync()[0];

      // Confidence based on variance (higher variance = more likely to be a note)
      const confidence = Math.min(1, variance * 2);

      centered.dispose();
      squared.dispose();

      return confidence;
    } catch (error) {
      console.error('Error calculating patch confidence:', error);
      return 0.5;
    }
  }

  /**
   * Filter patches by confidence threshold
   */
  filterPatches(patches: ImagePatch[], confidenceThreshold: number = 0.3): ImagePatch[] {
    return patches.filter((patch) => patch.confidence >= confidenceThreshold);
  }

  /**
   * Process patch batch for model inference
   */
  batchPatches(
    patches: ImagePatch[],
    batchSize: number = 32
  ): tf.Tensor[] {
    const batches: tf.Tensor[] = [];

    for (let i = 0; i < patches.length; i += batchSize) {
      const batch = patches.slice(i, Math.min(i + batchSize, patches.length));

      // Stack patches into a batch tensor [batch_size, 24, 24]
      const batchTensor = tf.stack(batch.map((p) => p.data as tf.Tensor2D));

      batches.push(batchTensor);
    }

    return batches;
  }

  /**
   * Crop image to region of interest
   */
  cropToROI(
    imageData: { data: Uint8ClampedArray; width: number; height: number },
    roi?: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  ): { data: Uint8ClampedArray; width: number; height: number } {
    if (!roi) {
      // Auto-detect ROI (remove white space)
      return this.autoDetectROI(imageData);
    }

    const { data, width } = imageData;
    const { x, y, width: roiWidth, height: roiHeight } = roi;

    const croppedData = new Uint8ClampedArray(roiWidth * roiHeight * 4);

    for (let cy = 0; cy < roiHeight; cy++) {
      for (let cx = 0; cx < roiWidth; cx++) {
        const srcIndex = ((y + cy) * width + (x + cx)) * 4;
        const dstIndex = (cy * roiWidth + cx) * 4;

        croppedData[dstIndex] = data[srcIndex];
        croppedData[dstIndex + 1] = data[srcIndex + 1];
        croppedData[dstIndex + 2] = data[srcIndex + 2];
        croppedData[dstIndex + 3] = data[srcIndex + 3];
      }
    }

    return {
      data: croppedData,
      width: roiWidth,
      height: roiHeight,
    };
  }

  /**
   * Auto-detect region of interest (remove white margins)
   */
  private autoDetectROI(imageData: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }): { data: Uint8ClampedArray; width: number; height: number } {
    const { data, width, height } = imageData;
    const WHITE_THRESHOLD = 240;

    // Find non-white boundaries
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const gray = (data[index] + data[index + 1] + data[index + 2]) / 3;

        if (gray < WHITE_THRESHOLD) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Add padding
    const padding = 20;
    const roi = {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      width: Math.min(width, maxX - minX + 2 * padding),
      height: Math.min(height, maxY - minY + 2 * padding),
    };

    return this.cropToROI(imageData, roi);
  }

  /**
   * Adjust image brightness and contrast
   */
  adjustBrightnessContrast(
    imageData: { data: Uint8ClampedArray; width: number; height: number },
    brightness: number = 1,
    contrast: number = 1
  ): { data: Uint8ClampedArray; width: number; height: number } {
    const { data, width, height } = imageData;
    const adjusted = new Uint8ClampedArray(data.length);

    for (let i = 0; i < data.length; i += 4) {
      // Apply brightness and contrast
      let r = data[i] * brightness;
      let g = data[i + 1] * brightness;
      let b = data[i + 2] * brightness;

      // Apply contrast (center around 128)
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;

      // Clamp values
      adjusted[i] = Math.max(0, Math.min(255, r));
      adjusted[i + 1] = Math.max(0, Math.min(255, g));
      adjusted[i + 2] = Math.max(0, Math.min(255, b));
      adjusted[i + 3] = data[i + 3]; // Preserve alpha
    }

    return {
      data: adjusted,
      width,
      height,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): PreprocessingConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PreprocessingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export singleton instance
export const imagePreprocessor = new ImagePreprocessor();
