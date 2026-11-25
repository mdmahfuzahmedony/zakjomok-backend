export type ImageFolder = 'products' | 'categories';

export const isPublicStorageImageUrl = (
  imageUrl: unknown,
  folder: ImageFolder,
): imageUrl is string => {
  const rawUrl = process.env.SUPABASE_URL || '';
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!supabaseUrl || !bucket || typeof imageUrl !== 'string') {
    return false;
  }

  const expectedPrefix = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${folder}/`;
  return imageUrl.startsWith(expectedPrefix);
};
