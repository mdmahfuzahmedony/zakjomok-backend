export type ImageFolder = 'products' | 'categories';

export const isPublicStorageImageUrl = (
  imageUrl: unknown,
  folder: ImageFolder,
): imageUrl is string => {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!supabaseUrl || !bucket || typeof imageUrl !== 'string') {
    return false;
  }

  const expectedPrefix = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${folder}/`;
  return imageUrl.startsWith(expectedPrefix);
};
