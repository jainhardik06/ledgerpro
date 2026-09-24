import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export type StorageProviderType = 'supabase' | 's3';

export interface UploadOptions {
  tenantId: string;
  buffer: Buffer;
  contentType: string;
  filename?: string;
}

export interface UploadResult {
  publicUrl: string;
  storagePath: string;
  provider: StorageProviderType;
}

/**
 * Storage configuration resolved from environment variables.
 */
function getStorageConfig() {
  const provider = (process.env.STORAGE_PROVIDER || 'supabase').toLowerCase() as StorageProviderType;

  return {
    provider,
    // Supabase config
    supabase: {
      url: process.env.SUPABASE_URL || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      bucket: process.env.SUPABASE_STORAGE_BUCKET || 'agency-assets',
    },
    // S3-compatible config (AWS, Cloudflare R2, MinIO, Wasabi)
    s3: {
      endpoint: process.env.S3_ENDPOINT, // Optional for AWS S3, required for R2/MinIO
      region: process.env.S3_REGION || 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      bucket: process.env.S3_BUCKET || 'agency-assets',
      publicDomain: process.env.S3_PUBLIC_DOMAIN || '', // e.g. https://pub-xxx.r2.dev or https://cdn.example.com
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  };
}

/**
 * Supabase Storage Client (Server-side privileged client with Service Role Key)
 */
function getSupabaseClient() {
  const { supabase } = getStorageConfig();
  if (!supabase.url || !supabase.serviceRoleKey) {
    throw new Error(
      'Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.'
    );
  }
  return createClient(supabase.url, supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * S3 Client (AWS SDK v3)
 */
function getS3Client() {
  const { s3 } = getStorageConfig();
  if (!s3.accessKeyId || !s3.secretAccessKey) {
    throw new Error(
      'S3 Storage is not configured. Please set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in your environment.'
    );
  }

  return new S3Client({
    region: s3.region,
    endpoint: s3.endpoint ? s3.endpoint : undefined,
    credentials: {
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    },
    forcePathStyle: s3.forcePathStyle,
  });
}

/**
 * Upload an agency logo to cloud storage under tenant-isolated path:
 * `agencies/{tenantId}/{filename}`
 *
 * Enforces multi-tenant workspace isolation at the storage path level.
 */
export async function uploadAgencyLogoToStorage({
  tenantId,
  buffer,
  contentType,
  filename,
}: UploadOptions): Promise<UploadResult> {
  const config = getStorageConfig();
  const safeFilename = filename || `logo_${Date.now()}.webp`;
  // Multi-tenant RLS path isolation:
  const storagePath = `agencies/${tenantId}/${safeFilename}`;

  if (config.provider === 'supabase') {
    const supabase = getSupabaseClient();
    const bucket = config.supabase.bucket;

    // Upload with upsert enabled so replacement is seamless
    const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = publicData.publicUrl;

    return {
      publicUrl,
      storagePath,
      provider: 'supabase',
    };
  } else if (config.provider === 's3') {
    const s3 = getS3Client();
    const bucket = config.s3.bucket;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'max-age=3600',
      // Note: ACL 'public-read' can be enabled if bucket ACLs are allowed,
      // but modern buckets use bucket-level public read policies.
    });

    await s3.send(command);

    // Resolve public CDN URL
    let publicUrl: string;
    if (config.s3.publicDomain) {
      const domain = config.s3.publicDomain.replace(/\/+$/, '');
      publicUrl = `${domain}/${storagePath}`;
    } else if (config.s3.endpoint) {
      // Cloudflare R2 / MinIO / custom endpoint format
      const endpoint = config.s3.endpoint.replace(/\/+$/, '');
      publicUrl = `${endpoint}/${bucket}/${storagePath}`;
    } else {
      // Standard AWS S3 public bucket format
      publicUrl = `https://${bucket}.s3.${config.s3.region}.amazonaws.com/${storagePath}`;
    }

    return {
      publicUrl,
      storagePath,
      provider: 's3',
    };
  } else {
    throw new Error(`Unsupported STORAGE_PROVIDER: "${config.provider}". Must be "supabase" or "s3".`);
  }
}

/**
 * Delete previous logo if needed to prevent dangling storage assets.
 */
export async function deleteAgencyLogoFromStorage(
  tenantId: string,
  storagePath: string
): Promise<void> {
  // Safety check: ensure path belongs to the tenant
  if (!storagePath.startsWith(`agencies/${tenantId}/`)) {
    throw new Error('Tenant storage boundary violation: cannot delete file outside tenant directory.');
  }

  const config = getStorageConfig();

  try {
    if (config.provider === 'supabase') {
      const supabase = getSupabaseClient();
      await supabase.storage.from(config.supabase.bucket).remove([storagePath]);
    } else if (config.provider === 's3') {
      const s3 = getS3Client();
      await s3.send(
        new DeleteObjectCommand({
          Bucket: config.s3.bucket,
          Key: storagePath,
        })
      );
    }
  } catch (err) {
    // Non-fatal: log and proceed
    console.warn(`[Storage] Failed to delete previous logo at ${storagePath}:`, err);
  }
}
