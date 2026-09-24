"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, ZoomIn, ZoomOut, RotateCw, Check, Crop as CropIcon, AlertCircle } from 'lucide-react';

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  fileName?: string;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob, previewUrl: string) => void;
}

const MAX_SIZE_BYTES = 150 * 1024; // 150 KB strict cap

/**
 * Initializes a centered 1:1 square crop box on the loaded image
 */
function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 85,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function ImageCropperModal({
  isOpen,
  imageSrc,
  fileName = 'logo.webp',
  onClose,
  onCropComplete,
}: ImageCropperModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [aspectCircular, setAspectCircular] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset state when modal opens with a new image
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotate(0);
      setErrorMessage(null);
      setIsProcessing(false);
    }
  }, [isOpen, imageSrc]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setCrop(centerAspectCrop(naturalWidth, naturalHeight, 1));
    }
  }, []);

  /**
   * Generates the cropped canvas and compresses it to WebP format <= 150 KB.
   */
  const handleSaveCrop = async () => {
    if (!imgRef.current || !completedCrop) {
      setErrorMessage('Please adjust the crop area before saving.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context is not available.');
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Desired output dimension: target max 512x512 for crystal crisp square avatars
      const pixelRatio = window.devicePixelRatio || 1;
      const targetSize = Math.min(
        512,
        Math.max(128, Math.round(completedCrop.width * scaleX))
      );

      canvas.width = targetSize;
      canvas.height = targetSize;

      ctx.imageSmoothingQuality = 'high';
      ctx.imageSmoothingEnabled = true;

      // Calculate source bounding coordinates
      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropWidth = completedCrop.width * scaleX;
      const cropHeight = completedCrop.height * scaleY;

      ctx.save();
      // Draw cropped slice directly to output dimensions
      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        targetSize,
        targetSize
      );
      ctx.restore();

      // Compress to WebP with iterative quality step-down to strictly ensure < 150 KB
      let quality = 0.92;
      let blob: Blob | null = null;

      const getBlobAsync = (q: number): Promise<Blob | null> => {
        return new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/webp', q);
        });
      };

      // Quality iteration loop
      while (quality >= 0.4) {
        blob = await getBlobAsync(quality);
        if (blob && blob.size <= MAX_SIZE_BYTES) {
          break;
        }
        quality -= 0.15;
      }

      // If still over 150 KB (rare for 512x512 WebP), downscale resolution to 320x320
      if (!blob || blob.size > MAX_SIZE_BYTES) {
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 320;
        fallbackCanvas.height = 320;
        const fbCtx = fallbackCanvas.getContext('2d');
        if (fbCtx) {
          fbCtx.imageSmoothingQuality = 'high';
          fbCtx.drawImage(canvas, 0, 0, 320, 320);
          blob = await new Promise((resolve) => {
            fallbackCanvas.toBlob((b) => resolve(b), 'image/webp', 0.8);
          });
        }
      }

      if (!blob) {
        throw new Error('Failed to create image blob from canvas.');
      }

      if (blob.size > MAX_SIZE_BYTES) {
        setErrorMessage(
          `Cropped image is ${(blob.size / 1024).toFixed(1)} KB, which exceeds the 150 KB limit. Please choose a simpler image or crop closer.`
        );
        setIsProcessing(false);
        return;
      }

      const previewUrl = URL.createObjectURL(blob);
      onCropComplete(blob, previewUrl);
      onClose();
    } catch (err) {
      console.error('[Cropper] Error saving crop:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Error generating cropped image.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cropper-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-lg bg-[#0a0a0a] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white">
              <CropIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 id="cropper-modal-title" className="text-[14px] font-semibold text-white tracking-tight">
                Crop Agency Logo
              </h2>
              <p className="text-[11px] text-neutral-400">
                1:1 Square aspect ratio · Auto-compressed to WebP (&lt;150 KB)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Cropper Canvas Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col items-center justify-center min-h-[260px] max-h-[50vh] bg-black/40">
          {errorMessage && (
            <div className="w-full mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="relative flex items-center justify-center max-w-full max-h-[42vh] overflow-hidden select-none touch-none">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop={aspectCircular}
              keepSelection
              className="max-h-[42vh] object-contain rounded-lg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Source preview"
                onLoad={onImageLoad}
                style={{
                  transform: `scale(${scale}) rotate(${rotate}deg)`,
                  transition: 'transform 100ms ease',
                  maxHeight: '40vh',
                  maxWidth: '100%',
                }}
                className="block select-none"
                crossOrigin="anonymous"
              />
            </ReactCrop>
          </div>
        </div>

        {/* Controls: Zoom, Rotate & Guide Shape Toggle */}
        <div className="px-5 py-3 border-t border-white/[0.06] bg-[#0c0c0c] space-y-3 shrink-0">
          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1 shrink-0">
              <ZoomOut className="w-3.5 h-3.5" />
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              disabled={isProcessing}
              aria-label="Zoom image"
              className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
            />
            <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1 shrink-0">
              <ZoomIn className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-mono text-neutral-400 w-9 text-right">
              {scale.toFixed(1)}x
            </span>
          </div>

          {/* Quick Shape & Orientation Badges */}
          <div className="flex items-center justify-between gap-2 pt-1 text-[12px]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAspectCircular(true)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  aspectCircular
                    ? 'bg-white/[0.12] text-white border border-white/[0.15]'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                Circle Guide
              </button>
              <button
                type="button"
                onClick={() => setAspectCircular(false)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  !aspectCircular
                    ? 'bg-white/[0.12] text-white border border-white/[0.15]'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                Square Guide
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRotate((r) => (r + 90) % 360)}
              disabled={isProcessing}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <RotateCw className="w-3 h-3" />
              Rotate 90°
            </button>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-white/[0.08] bg-[#080808] shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="h-8.5 px-4 rounded-lg border border-white/[0.1] text-[12px] font-medium text-neutral-300 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 h-8.5 px-5 bg-white text-black rounded-lg text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50 shadow-sm"
          >
            {isProcessing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Optimizing…
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Crop &amp; Apply
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
