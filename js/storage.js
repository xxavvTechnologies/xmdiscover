import { supabase } from './supabase.js';

// Add image dimension validation helper
function validateImageDimensions(imageFile) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(imageFile);
        
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            if (img.width < 1000 || img.height < 1000) {
                reject(new Error('Image dimensions must be at least 1000x1000 pixels'));
            }
            if (img.width > 3000 || img.height > 3000) {
                console.warn('Recommended maximum image size is 3000x3000 pixels');
            }
            resolve();
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image'));
        };
        
        img.src = objectUrl;
    });
}

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
    
    // Validate dimensions before upload
    await validateImageDimensions(file);
    
    return uploadFile(file, 'images', path);
}

export async function uploadAudio(file, path) {
    // Validate audio type
    if (!file.type.startsWith('audio/')) {
        throw new Error('File must be audio');
    }
    return uploadFile(file, 'audio', path);
}
