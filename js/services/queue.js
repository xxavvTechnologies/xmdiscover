import { supabase } from '../supabase.js';

export class QueueService {
    static async getSignedUrl(url) {
        if (!url) return null;
        
        try {
            if (url.includes('supabase.co/storage')) {
                const urlParts = url.split('/storage/v1/object/');
                if (urlParts.length === 2) {
                    const pathPart = urlParts[1].replace(/^(public|sign)\//, '');
                    const cleanPath = pathPart.split('?')[0];
                    const bucketName = cleanPath.split('/')[0];
                    const filePath = cleanPath.split('/').slice(1).join('/');

                    const { data } = await supabase.storage
                        .from(bucketName)
                        .createSignedUrl(filePath, 3600);

                    return data?.signedUrl || null;
                }
            }
            return url;
        } catch (error) {
            console.error('Error getting signed URL:', error);
            return null;
        }
    }

    static async generateSmartQueue(currentTrack) {
        try {
            if (!currentTrack?.id) {
                throw new Error('Current track info is required');
            }

            // First, fetch similar tracks from the same artist
            const { data: similarTracks } = await supabase
                .from('songs')
                .select(`
                    id,
                    title,
                    duration,
                    audio_url,
                    cover_url,
                    artists (
                        id,
                        name
                    )
                `)
                .neq('id', currentTrack.id)
                .eq('artist_id', currentTrack.artistId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (!similarTracks?.length) {
                // If no tracks from same artist, try getting popular tracks
                const { data: popularTracks } = await supabase
                    .from('songs')
                    .select(`
                        id,
                        title,
                        duration,
                        audio_url,
                        cover_url,
                        artists (
                            id,
                            name
                        )
                    `)
                    .neq('id', currentTrack.id)
                    .order('play_count', { ascending: false })
                    .limit(10);

                if (!popularTracks?.length) {
                    throw new Error('No similar tracks found');
                }

                return this.processTracksList(popularTracks);
            }

            return this.processTracksList(similarTracks);

        } catch (error) {
            console.error('Failed to generate smart queue:', error);
            throw error;
        }
    }

    static async processTracksList(tracks) {
        return Promise.all(tracks.map(async track => {
            const signedUrl = await this.getSignedUrl(track.audio_url);
            if (!signedUrl) return null;

            return {
                id: track.id,
                title: track.title,
                artist: track.artists?.name || 'Unknown Artist',
                audioUrl: signedUrl,
                coverUrl: track.cover_url,
                artistId: track.artists?.id
            };
        })).then(tracks => tracks.filter(track => track !== null));
    }

    static async getArtistTracks(artistId) {
        const { data: tracks } = await supabase
            .from('songs')
            .select(`
                id,
                title,
                duration,
                audio_url,
                cover_url,
                artists!inner (
                    id,
                    name
                )
            `)
            .eq('artists.id', artistId)
            .eq('status', 'published')
            .limit(5);

        return tracks?.map(this.formatTrack) || [];
    }

    static async getRelatedTracks(trackId) {
        const { data: baseSong } = await supabase
            .from('songs')
            .select('artists!inner (genres)').eq('id', trackId).single();

        if (!baseSong?.artists?.genres?.length) return [];

        const { data: tracks } = await supabase
            .from('songs')
            .select(`
                id,
                title,
                duration,
                audio_url,
                cover_url,
                artists!inner (
                    id,
                    name,
                    genres
                )
            `)
            .eq('status', 'published')
            .neq('id', trackId)
            .limit(10);

        // Filter tracks with similar genres
        const baseGenres = new Set(baseSong.artists.genres);
        const relatedTracks = tracks?.filter(track => 
            track.artists.genres?.some(genre => baseGenres.has(genre))
        ) || [];

        return relatedTracks.map(this.formatTrack);
    }

    static formatTrack(track) {
        return {
            id: track.id,
            title: track.title,
            audioUrl: track.audio_url,
            coverUrl: track.cover_url,
            artist: track.artists.name,
            artistId: track.artists.id,
            duration: track.duration
        };
    }
}
