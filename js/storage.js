import { supabase } from './supabase.js';
import { notifications } from './services/notifications.js';

// File size constants in bytes
const FILE_SIZE_LIMITS = {
    AUDIO: 41943040,  // 40MB
    IMAGE: 5242880,   // 5MB
    MAX_TOTAL: 52428800 // 50MB - for multi-file uploads
};

// Add file validation helper
function validateFile(file, type) {
    if (type === 'audio') {
        if (file.size > FILE_SIZE_LIMITS.AUDIO) {
            throw new Error('Audio file must be less than 40MB');
        }
        if (!file.type.startsWith('audio/')) {
            throw new Error('File must be an audio file');
        }
    } else if (type === 'image') {
        if (file.size > FILE_SIZE_LIMITS.IMAGE) {
            throw new Error('Image must be less than 5MB');
        }
        if (!file.type.startsWith('image/')) {
            throw new Error('File must be an image');
        }
    }
}

// Add chunked upload helper for large files
async function uploadInChunks(file, bucket, path) {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${path}/${fileName}`;
    
    let uploadedChunks = 0;

    for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);

        const { error } = await supabase.storage
            .from(bucket)
            .upload(`${filePath}_${i}`, chunk, {
                upsert: true
            });

        if (error) throw error;
        
        uploadedChunks++;
        const progress = Math.round((uploadedChunks / chunks) * 100);
        notifications.update(`Uploading ${file.name}: ${progress}%`, 'info');
    }

    // Combine chunks
    const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
            upsert: true
        });

    if (error) throw error;

    // Clean up chunks
    for (let i = 0; i < chunks; i++) {
        await supabase.storage
            .from(bucket)
            .remove([`${filePath}_${i}`]);
    }

    return filePath;
}

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
        notifications.show(`Uploading ${file.name}...`, 'info');

        let filePath;
        if (file.size > 10 * 1024 * 1024) {
            filePath = await uploadInChunks(file, bucket, path);
        } else {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
            filePath = `${path}/${fileName}`;
            
            const { error } = await supabase.storage
                .from(bucket)
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;
        }

        // For ads bucket, get signed URL instead of public URL
        if (bucket === 'ads') {
            const { data } = await supabase.storage
                .from(bucket)
                .createSignedUrl(filePath, 3600); // 1 hour expiry
            return data.signedUrl;
        }

        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        notifications.show(`Successfully uploaded ${file.name}`, 'success');
        return publicUrl;

    } catch (error) {
        console.error('Upload error:', error);
        notifications.show(`Failed to upload ${file.name}: ${error.message}`, 'error');
        throw error;
    }
}

export async function uploadImage(file, path) {
    validateFile(file, 'image');
    await validateImageDimensions(file);
    return uploadFile(file, 'images', path);
}

export async function uploadAudio(file, path) {
    validateFile(file, 'audio');
    const bucket = path === 'ads' ? 'ads' : 'audio'; // Use private bucket for ads
    return uploadFile(file, bucket, path);
}
