"use client";

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, Image as ImageIcon, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { ImageCropperModal } from './ImageCropperModal';
import { getAgencyMonogram } from '@/lib/agency/utils/logo';

interface LogoUploadZoneProps {
  currentLogoUrl?: string;
  agencyName?: string;
  disabled?: boolean;
  onLogoUpdated: (newLogoUrl: string) => void;
  onLogoRemoved?: () => void;
}

const MAX_RAW_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB raw limit before cropping
const STRICT_OUTPUT_CAP_KB = 150;

export function LogoUploadZone({
  currentLogoUrl,
  agencyName = 'Agency',
  disabled = false,
  onLogoUpdated,
  onLogoRemoved,
}: LogoUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Reset image error if logo URL changes
  React.useEffect(() => {
    setImageError(false);
  }, [currentLogoUrl]);

  // Cropper Modal States
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('logo.webp');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  /**
   * Validates selected raw file before initiating crop dialog
   */
  const processRawFile = (file: File) => {
    if (disabled || isUploading) return;

    // Check MIME type
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Only image files (PNG, JPG, WebP) are supported.');
      return;
    }

    // Safety guard against massive multi-hundred megabyte raw files
    if (file.size > MAX_RAW_FILE_SIZE_BYTES) {
      showToast('error', `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select an image under 10 MB.`);
      return;
    }

    setPendingFileName(file.name.replace(/\.[^/.]+$/, '') + '.webp');

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedImageSrc(reader.result);
        setIsCropperOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processRawFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processRawFile(e.target.files[0]);
      // Reset input value so re-selecting identical file still triggers change
      e.target.value = '';
    }
  };

  /**
   * Upload the cropped WebP image to backend API
   */
  const handleCroppedUpload = async (blob: Blob) => {
    // Client-side strict validation check
    if (blob.size > STRICT_OUTPUT_CAP_KB * 1024) {
      showToast(
        'error',
        `Image exceeds the strict ${STRICT_OUTPUT_CAP_KB} KB limit (${(blob.size / 1024).toFixed(1)} KB). Please re-crop with closer zoom.`
      );
      return;
    }

    setIsUploading(true);
    setToast(null);

    try {
      const formData = new FormData();
      formData.append('file', blob, pendingFileName || 'logo.webp');

      const response = await fetch('/api/agency/upload-logo', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload logo to storage.');
      }

      showToast('success', 'Logo uploaded & updated globally across the workspace!');
      if (data.logoUrl) {
        onLogoUpdated(data.logoUrl);
      }
    } catch (err) {
      console.error('[LogoUpload] Upload error:', err);
      showToast(
        'error',
        err instanceof Error ? err.message : 'Network error uploading logo. Please try again.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isUploading) return;
    if (onLogoRemoved) {
      onLogoRemoved();
      showToast('success', 'Logo removed.');
    }
  };

  return (
    <div className="space-y-3">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          role="status"
          className={`p-3 rounded-lg text-[12px] flex items-center justify-between gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200 ${
            toast.kind === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/20 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span className="truncate">{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[11px] underline opacity-70 hover:opacity-100 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Upload / Dropzone Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        className={`relative group rounded-xl border border-dashed transition-all duration-200 p-3.5 sm:p-4 cursor-pointer select-none ${
          isDragging
            ? 'border-white bg-white/[0.06] shadow-lg shadow-white/5'
            : 'border-white/[0.12] bg-white/[0.02] hover:border-white/[0.25] hover:bg-white/[0.04]'
        } ${disabled || isUploading ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={disabled || isUploading}
          className="hidden"
          aria-label="Upload agency logo"
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            {/* Avatar Preview Box */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 sm:w-15 sm:h-15 rounded-xl bg-neutral-900 border border-white/[0.1] overflow-hidden flex items-center justify-center shadow-inner group-hover:border-white/[0.2] transition-colors">
                {currentLogoUrl && !imageError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentLogoUrl}
                    alt={agencyName}
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-neutral-500">
                    <span className="text-[14px] font-bold tracking-wider text-neutral-400 font-mono">
                      {getAgencyMonogram(agencyName)}
                    </span>
                  </div>
                )}
              </div>

              {/* Spinner Overlay on Active Upload */}
              {isUploading && (
                <div className="absolute inset-0 rounded-xl bg-black/70 backdrop-blur-xs flex items-center justify-center text-white">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>

            {/* Prompt & Specs Info */}
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5 mb-0.5">
                <UploadCloud className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="text-[13px] font-semibold text-white tracking-tight">
                  {currentLogoUrl ? 'Agency Brand Logo' : 'Upload Brand Logo'}
                </span>
              </div>
              <p className="text-[11.5px] text-neutral-400 mb-1.5 leading-snug">
                Drag &amp; drop, or{' '}
                <span className="text-white underline decoration-white/30 group-hover:decoration-white transition-colors">
                  browse files
                </span>
                .
              </p>
              <div className="flex flex-wrap items-center gap-1 text-[10.5px] text-neutral-400 font-medium">
                <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                  1:1 Square
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                  Max 150 KB
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                  WebP
                </span>
              </div>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex items-center gap-2 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-white/[0.06] justify-end shrink-0 w-full sm:w-auto">
            {currentLogoUrl && onLogoRemoved && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || isUploading}
                title="Remove current logo"
                className="h-8.5 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 text-[12px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="sm:hidden text-[11.5px]">Remove</span>
              </button>
            )}
            <button
              type="button"
              disabled={disabled || isUploading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center justify-center gap-1.5 h-8.5 px-4 rounded-lg bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50 shadow-sm flex-1 sm:flex-initial"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                  Uploading…
                </>
              ) : (
                currentLogoUrl ? 'Replace' : 'Upload'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Responsive Cropper Modal Popup */}
      <ImageCropperModal
        isOpen={isCropperOpen}
        imageSrc={selectedImageSrc}
        fileName={pendingFileName}
        onClose={() => {
          setIsCropperOpen(false);
          setSelectedImageSrc(null);
        }}
        onCropComplete={(croppedBlob) => {
          handleCroppedUpload(croppedBlob);
        }}
      />
    </div>
  );
}
