'use server';

import { connectGrowthDb } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function addDirectory(formData: FormData) {
  const { db } = await connectGrowthDb();
  if (!db) throw new Error('Growth Database not connected');

  const name = formData.get('name') as string;
  const url = formData.get('url') as string;
  const authority = parseInt(formData.get('authority') as string, 10) || 0;
  const tier = parseInt(formData.get('tier') as string, 10) || 2;

  await db.collection('directories').updateOne(
    { name },
    { $setOnInsert: { name, url, authority, tier, status: 'planned', created_at: new Date() } },
    { upsert: true },
  );

  revalidatePath('/super-admin/discovery');
  revalidatePath('/super-admin/discovery/directories');
}

/** Mark a directory as submitted — creates the tracked submission record the dashboard reads. */
export async function markSubmitted(formData: FormData) {
  const { db } = await connectGrowthDb();
  if (!db) throw new Error('Growth Database not connected');

  const directoryId = formData.get('directoryId') as string;
  const directoryName = formData.get('directoryName') as string;
  const notes = (formData.get('notes') as string) || '';

  await db.collection('directory_submissions').insertOne({
    directoryId,
    directoryName,
    status: 'Pending',
    submittedAt: new Date(),
    notes,
  });
  await db.collection('directories').updateOne({ name: directoryName }, { $set: { status: 'submitted', submitted_at: new Date() } });

  revalidatePath('/super-admin/discovery');
  revalidatePath('/super-admin/discovery/directories');
}

/** Approve a pending submission — optionally records the resulting backlink. */
export async function approveSubmission(formData: FormData) {
  const { db } = await connectGrowthDb();
  if (!db) throw new Error('Growth Database not connected');

  const submissionId = formData.get('submissionId') as string;
  const directoryName = formData.get('directoryName') as string;
  const backlinkUrl = (formData.get('backlinkUrl') as string) || '';
  const isDoFollow = formData.get('isDoFollow') === 'on';

  const { ObjectId } = await import('mongodb');
  await db.collection('directory_submissions').updateOne(
    { _id: new ObjectId(submissionId) },
    { $set: { status: 'Approved', approvedAt: new Date() } },
  );
  await db.collection('directories').updateOne({ name: directoryName }, { $set: { status: 'approved' } });

  if (backlinkUrl) {
    await db.collection('backlinks').insertOne({
      url: backlinkUrl,
      sourceDirectory: directoryName,
      status: 'Active',
      isDoFollow,
      discoveredAt: new Date(),
    });
  }

  revalidatePath('/super-admin/discovery');
  revalidatePath('/super-admin/discovery/directories');
}

export async function rejectSubmission(formData: FormData) {
  const { db } = await connectGrowthDb();
  if (!db) throw new Error('Growth Database not connected');

  const submissionId = formData.get('submissionId') as string;
  const directoryName = formData.get('directoryName') as string;

  const { ObjectId } = await import('mongodb');
  await db.collection('directory_submissions').updateOne(
    { _id: new ObjectId(submissionId) },
    { $set: { status: 'Rejected', rejectedAt: new Date() } },
  );
  await db.collection('directories').updateOne({ name: directoryName }, { $set: { status: 'rejected' } });

  revalidatePath('/super-admin/discovery');
  revalidatePath('/super-admin/discovery/directories');
}

export async function deleteDirectory(name: string) {
  const { db } = await connectGrowthDb();
  if (!db) throw new Error('Growth Database not connected');

  await db.collection('directories').deleteOne({ name });

  revalidatePath('/super-admin/discovery');
  revalidatePath('/super-admin/discovery/directories');
}
