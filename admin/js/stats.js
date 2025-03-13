import { supabase } from '../../js/supabase.js';

// Cache stats for 5 minutes
let statsCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function getDashboardStats() {
    // Return cached stats if available and not expired
    const now = Date.now();
    if (statsCache && (now - lastFetchTime) < CACHE_DURATION) {
        return statsCache;
    }

    const stats = {};
    
    try {
        // Use single query to get counts
        const [playlists, albums, songs, artists] = await Promise.all([
            supabase.from('playlists').select('*', { count: 'exact', head: true }),
            supabase.from('albums').select('*', { count: 'exact', head: true }),
            supabase.from('songs').select('*', { count: 'exact', head: true }),
            supabase.from('artists').select('*', { count: 'exact', head: true })
        ]);

        stats.playlists = playlists.count;
        stats.albums = albums.count;
        stats.songs = songs.count;
        stats.artists = artists.count;

        // Update cache
        statsCache = stats;
        lastFetchTime = now;

        return stats;
    } catch (error) {
        console.error('Error fetching stats:', error);
        // Return cached stats if available, even if expired
        if (statsCache) {
            return statsCache;
        }
        throw error;
    }
}
