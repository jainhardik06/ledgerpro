'use server';

import { connectGrowthDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

async function requireSuperAdmin() {
  const session = await getSessionUser();
  if (!session || session.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized');
  }
}

export async function addSocialProfile(formData: FormData) {
  await requireSuperAdmin();
  const { db } = await connectGrowthDb();
  if (!db) throw new Error('Growth Database not connected');

  const platform = formData.get('platform') as string;
  const url = formData.get('url') as string;
  const username = formData.get('username') as string;
  const followersStr = formData.get('followers') as string;

  const followers = parseInt(followersStr, 10) || 0;
  const verified = formData.get('verified') === 'on';

  await db.collection('social_profiles').insertOne({
    platform,
    url,
    username,
    followers,
    verified,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  revalidatePath('/super-admin/discovery');
  revalidatePath('/super-admin/discovery/social');
}

export async function deleteSocialProfile(platform: string) {
  await requireSuperAdmin();
  const { db } = await connectGrowthDb();
  if (!db) throw new Error('Growth Database not connected');

  await db.collection('social_profiles').deleteOne({ platform });

  revalidatePath('/super-admin/discovery');
  revalidatePath('/super-admin/discovery/social');
}
