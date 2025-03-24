import { supabase } from '../supabase.js';

export class QueueService {
    static async getSignedUrl(url, type = 'song') {
        if (!url) return null;
        
        try {
            // Handle podcast episodes
            if (type === 'podcast') {
                console.log('[Queue] Handling podcast episode URL');
                // Extract episode title from URL or metadata
                const episodeTitle = url.split('/').pop()?.split('?')[0] || '';
                
                // Try to find matching episode in database
                const { data: episode } = await supabase
                    .from('podcast_episodes')
                    .select('audio_url')
                    .ilike('title', episodeTitle)
                    .single();

                if (episode?.audio_url) {
                    console.log('[Queue] Found matching podcast episode');
                    return episode.audio_url;
                }

                // If no match found, use original URL (from RSS feed)
                console.log('[Queue] Using original podcast URL:', url);
                return url;
            }

            // Handle podcasts and direct URLs
            if (type === 'podcast' || url.startsWith('http') && !url.includes('supabase.co')) {
                console.log('[Queue] Using direct URL:', url);
                return url;
            }
            
            // Handle Supabase storage URLs
            if (url.includes('supabase.co/storage')) {
                console.log('[Queue] Processing Supabase storage URL');
                const urlParts = url.split('/storage/v1/object/');
                if (urlParts.length === 2) {
                    const pathPart = urlParts[1].replace(/^(public|sign)\//, '');
                    const cleanPath = pathPart.split('?')[0];
                    const bucketName = cleanPath.split('/')[0];
                    const filePath = cleanPath.split('/').slice(1).join('/');

                    const { data } = await supabase.storage
                        .from(bucketName)
                        .createSignedUrl(filePath, 3600);

                    if (!data?.signedUrl) {
                        throw new Error('Failed to generate signed URL');
                    }
                    
                    console.log('[Queue] Generated signed URL successfully');
                    return data.signedUrl;
                }
            }

            // Handle relative URLs
            if (!url.startsWith('http')) {
                console.log('[Queue] Invalid URL format:', url);
                return null;
            }

            return url;
            
        } catch (error) {
            console.error('[Queue] Error processing URL:', error);
            return null;
        }
    }

    static async generateSmartQueue(currentTrack) {
        try {
            if (!currentTrack?.id) {
                throw new Error('Current track info is required');
            }

            // Try different curation strategies in order
            let tracks = await this.getSameArtistTracks(currentTrack);
            if (tracks?.length) return tracks;

            tracks = await this.getSimilarGenreTracks(currentTrack);
            if (tracks?.length) return tracks;

            tracks = await this.getContextualTracks(currentTrack);
            if (tracks?.length) return tracks;

            tracks = await this.getPopularTracks(currentTrack);
            if (tracks?.length) return tracks;

            throw new Error('No similar tracks found');

        } catch (error) {
            console.error('Failed to generate smart queue:', error);
            throw error;
        }
    }

    static async getSameArtistTracks(currentTrack, limit = 10) {
        const { data: tracks } = await supabase
            .from('songs')
            .select(`
                id, title, duration, audio_url, cover_url, 
                artists!inner(id, name),
                albums(id, title)
            `)
            .eq('artists.id', currentTrack.artistId)
            .neq('id', currentTrack.id)
            .order('play_count', { ascending: false })
            .limit(limit);

        return await this.processTracksList(tracks || []);
    }

    static async getSimilarGenreTracks(currentTrack, limit = 10) {
        const { data: artistData } = await supabase
            .from('artists')
            .select('genres')
            .eq('id', currentTrack.artistId)
            .single();

        if (!artistData?.genres?.length) return [];

        const { data: tracks } = await supabase
            .from('songs')
            .select(`
                id, title, duration, audio_url, cover_url,
                artists!inner(id, name, genres)
            `)
            .neq('artists.id', currentTrack.artistId)
            .eq('status', 'published')
            .order('play_count', { ascending: false })
            .limit(limit * 2);

        // Filter for genre matches and randomize selection
        const matchingTracks = (tracks || []).filter(track => 
            track.artists.genres?.some(genre => 
                artistData.genres.includes(genre)
            )
        );
        
        return await this.processTracksList(
            this.shuffleArray(matchingTracks).slice(0, limit)
        );
    }

    static async getContextualTracks(currentTrack, limit = 10) {
        // Try to find tracks from same album/playlist context
        const { data: contextTracks } = await supabase.rpc('get_contextual_tracks', {
            p_track_id: currentTrack.id,
            p_limit: limit
        });

        if (contextTracks?.length) {
            return await this.processTracksList(contextTracks);
        }

        // Try tracks with similar tags
        const { data: taggedTracks } = await supabase.rpc('get_similar_tagged_tracks', {
            p_track_id: currentTrack.id,
            p_limit: limit
        });

        return await this.processTracksList(taggedTracks || []);
    }

    static async getPopularTracks(currentTrack, limit = 10) {
        const { data: tracks } = await supabase
            .from('songs')
            .select(`
                id, title, duration, audio_url, cover_url,
                artists!inner(id, name)
            `)
            .neq('id', currentTrack.id)
            .eq('status', 'published')
            .order('play_count', { ascending: false })
            .limit(limit);

        return await this.processTracksList(tracks || []);
    }

    static shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
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

    static async fetchTrackData(trackId, type = 'song') {
        try {
            // Handle podcast episodes differently
            if (type === 'podcast') {
                const { data: episode } = await supabase
                    .from('podcast_episodes')
                    .select(`
                        id,
                        title,
                        audio_url,
                        description,
                        podcasts (
                            id,
                            title,
                            image_url
                        )
                    `)
                    .eq('id', trackId)
                    .single();

                if (!episode) {
                    console.error('[Queue] Podcast episode not found:', trackId);
                    return null;
                }

                return {
                    id: episode.id,
                    title: episode.title,
                    audioUrl: episode.audio_url,
                    coverUrl: episode.podcasts?.image_url,
                    artist: episode.podcasts?.title,
                    type: 'podcast'
                };
            }

            // Handle regular songs
            const { data: track } = await supabase
                .from('songs')
                .select(`
                    id,
                    title,
                    audio_url,
                    cover_url,
                    artist_id,
                    artists (
                        id,
                        name
                    )
                `)
                .eq('id', trackId)
                .single();

            if (!track) {
                console.error('[Queue] Track not found:', trackId);
                return null;
            }

            // Process URL if needed
            const audioUrl = await this.getSignedUrl(track.audio_url, type);
            
            return {
                id: track.id,
                title: track.title,
                audioUrl: audioUrl,
                coverUrl: track.cover_url,
                artist: track.artists?.name || 'Unknown Artist',
                artistId: track.artists?.id,
                type: 'song'
            };
        } catch (error) {
            console.error('[Queue] Error fetching track data:', error);
            return null;
        }
    }

    static async fetchPodcastEpisode(episodeId) {
        try {
            const { data: episode } = await supabase
                .from('podcast_episodes')
                .select(`
                    id,
                    title,
                    audio_url,
                    podcast_id,
                    podcasts (
                        title,
                        image_url
                    )
                `)
                .eq('id', episodeId)
                .single();

            if (!episode) {
                console.error('[Queue] Podcast episode not found:', episodeId);
                return null;
            }

            return {
                id: episode.id,
                title: episode.title,
                audioUrl: episode.audio_url,
                coverUrl: episode.podcasts?.image_url,
                artist: episode.podcasts?.title
            };
        } catch (error) {
            console.error('[Queue] Error fetching podcast episode:', error);
            return null;
        }
    }
}
