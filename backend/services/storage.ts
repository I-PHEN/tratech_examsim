import { supabase } from '../lib/supabase';

const BUCKET = 'ingestion-uploads';

export async function uploadFile(
  path: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, data, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function removeFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Storage remove failed: ${error.message}`);
}

export async function listFiles(prefix: string): Promise<Array<{ name: string }>> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 200 });
  if (error) throw new Error(`Storage list failed: ${error.message}`);
  return data ?? [];
}
