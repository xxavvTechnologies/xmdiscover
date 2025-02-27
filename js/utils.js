import { supabase } from './supabase-config.js';

export async function fetchUserLibrary() {
    const { data: { user } } = await supabase.auth.getUser();
    
    return await supabase
        .from('user_library')
        .select(`
            songs (
                *,
                artists (name),
                albums (title, cover_art_url)
            )
        `)
        .eq('user_id', user.id);
}

export async function createPlaylist(name, description = '', is_public = false) {
    const { data: { user } } = await supabase.auth.getUser();
    
    return await supabase
        .from('playlists')
        .insert([
            {
                name,
                description,
                is_public,
                user_id: user.id,
                created_at: new Date()
            }
        ]);
}

export async function addSongToPlaylist(playlistId, songId) {
    const { data: position } = await supabase
        .from('playlist_songs')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1);

    const nextPosition = position?.[0]?.position + 1 || 0;

    return await supabase
        .from('playlist_songs')
        .insert([
            {
                playlist_id: playlistId,
                song_id: songId,
                position: nextPosition,
                added_at: new Date()
            }
        ]);
}

export async function addToLibrary(songId) {
    const { data: { user } } = await supabase.auth.getUser();
    
    return await supabase
        .from('user_library')
        .insert([
            {
                user_id: user.id,
                song_id: songId,
                added_at: new Date()
            }
        ]);
}
