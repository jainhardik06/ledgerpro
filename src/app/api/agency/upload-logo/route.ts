import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, updateTenant } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyGeneralSettings } from '@/lib/agency/domain/agency.settings';
import { uploadAgencyLogoToStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Strict 150 KB limit
const MAX_FILE_SIZE_BYTES = 150 * 1024; // 153,600 bytes
const ALLOWED_MIME_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/jpg'];

/**
 * POST /api/agency/upload-logo
 *
 * Secure server-side endpoint handling agency logo file upload:
 * 1. RBAC authorization (agency.settings.manage — Tenant Admin / Super Admin)
 * 2. Multi-tenant workspace isolation (tenantId enforced from authenticated session)
 * 3. Strict 150 KB file size validation
 * 4. Cloud Storage transmission (Supabase Storage or AWS S3 compatible)
 * 5. MongoDB synchronization (updating agencySettings.general.logoUrl and tenant.logoUrl)
 * 6. Audit trail logging
 */
export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.settings.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }

  const tenantId =
    gate.context.tenant.id ||
    (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);

  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant context could not be resolved' }, { status: 500 });
  }

  const session = gate.context.session;
  const ipAddress = firstClientIp(req);

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No image file provided in request.' },
        { status: 400 }
      );
    }

    // 1. Strict Size Check (150 KB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File size (${(file.size / 1024).toFixed(1)} KB) exceeds the maximum allowed limit of 150 KB. Please crop or optimize the image before uploading.`,
        },
        { status: 400 }
      );
    }

    // 2. MIME Type Verification
    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      return NextResponse.json(
        {
          error: `Invalid file format (${file.type}). Please upload a WebP, PNG, or JPEG image.`,
        },
        { status: 400 }
      );
    }

    // Convert file to Node buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Cloud Storage Upload (Supabase / S3)
    const timestamp = Date.now();
    const extension = file.type === 'image/webp' ? 'webp' : file.type.split('/')[1] || 'webp';
    const filename = `logo_${timestamp}.${extension}`;

    let uploadResult;
    try {
      uploadResult = await uploadAgencyLogoToStorage({
        tenantId,
        buffer,
        contentType: file.type,
        filename,
      });
    } catch (storageErr) {
      logError('agency:upload-logo storage provider error', storageErr, { tenantId });
      const message = storageErr instanceof Error ? storageErr.message : 'Storage upload failed';
      return NextResponse.json(
        { error: `Cloud storage error: ${message}` },
        { status: 502 }
      );
    }

    const publicUrl = uploadResult.publicUrl;

    // 4. Database Synchronization (MongoDB)
    // Update agencySettings general section
    const updateResult = await updateAgencyGeneralSettings(
      tenantId,
      { logoUrl: publicUrl },
      {
        username: session.username,
        tenantId,
        log: (action: string, detail: string) =>
          createLog(session.username, action, detail, tenantId, ipAddress),
      }
    );

    if (!updateResult.ok) {
      return NextResponse.json(
        { error: updateResult.error ?? 'Failed to update agency settings in database' },
        { status: updateResult.status }
      );
    }

    // Also update tenant document directly for rapid root retrieval
    await updateTenant(tenantId, {
      agencySettings: updateResult.data,
    });

    // 5. Audit Log
    await createLog(
      session.username,
      'AGENCY_LOGO_UPLOADED',
      `Uploaded new agency logo to ${uploadResult.provider} at ${uploadResult.storagePath}`,
      tenantId,
      ipAddress
    );

    return NextResponse.json({
      success: true,
      logoUrl: publicUrl,
      storagePath: uploadResult.storagePath,
      provider: uploadResult.provider,
    });
  } catch (error) {
    logError('agency:upload-logo unexpected error', error, { tenantId });
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the logo upload.' },
      { status: 500 }
    );
  }
}
