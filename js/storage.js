import { supabase } from './supabase.js';

export async function uploadFile(file, bucket, path) {
    try {
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${path}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

export async function uploadImage(file, path) {
    // Validate image type
    if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
    }
    return uploadFile(file, 'images', path);
}

export async function uploadAudio(file, path) {
    // Validate audio type
    if (!file.type.startsWith('audio/')) {
        throw new Error('File must be audio');
    }
    return uploadFile(file, 'audio', path);
}
