import { supabase } from '../supabase.js';
import { notifications } from './notifications.js';

export const FollowService = {
    async savePlaylist(playlistId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('saved_playlists')
                .insert([{ user_id: session.user.id, playlist_id: playlistId }]);

            if (error) throw error;
            notifications.show('Playlist saved to library', 'success');
            return true;
        } catch (error) {
            console.error('Failed to save playlist:', error);
            notifications.show('Failed to save playlist', 'error');
            return false;
        }
    },

    async unsavePlaylist(playlistId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('saved_playlists')
                .delete()
                .eq('user_id', session.user.id)
                .eq('playlist_id', playlistId);

            if (error) throw error;
            notifications.show('Playlist removed from library', 'success');
            return true;
        } catch (error) {
            console.error('Failed to unsave playlist:', error);
            notifications.show('Failed to remove playlist', 'error');
            return false;
        }
    },

    async followArtist(artistId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('artist_follows')
                .insert([{ user_id: session.user.id, artist_id: artistId }]);

            if (error) throw error;
            notifications.show('Following artist', 'success');
            return true;
        } catch (error) {
            console.error('Failed to follow artist:', error);
            notifications.show('Failed to follow artist', 'error');
            return false;
        }
    },

    async unfollowArtist(artistId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('artist_follows')
                .delete()
                .eq('user_id', session.user.id)
                .eq('artist_id', artistId);

            if (error) throw error;
            notifications.show('Unfollowed artist', 'success');
            return true;
        } catch (error) {
            console.error('Failed to unfollow artist:', error);
            notifications.show('Failed to unfollow artist', 'error');
            return false;
        }
    },

    async followPodcast(podcastId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('podcast_follows')
                .insert([{ user_id: session.user.id, podcast_id: podcastId }]);

            if (error) throw error;
            notifications.show('Following podcast', 'success');
            return true;
        } catch (error) {
            console.error('Failed to follow podcast:', error);
            notifications.show('Failed to follow podcast', 'error');
            return false;
        }
    },

    async unfollowPodcast(podcastId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('podcast_follows')
                .delete()
                .eq('user_id', session.user.id)
                .eq('podcast_id', podcastId);

            if (error) throw error;
            notifications.show('Unfollowed podcast', 'success');
            return true;
        } catch (error) {
            console.error('Failed to unfollow podcast:', error);
            notifications.show('Failed to unfollow podcast', 'error');
            return false;
        }
    },

    async isPlaylistSaved(playlistId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;

        const { data } = await supabase
            .from('saved_playlists')
            .select('playlist_id')
            .eq('user_id', session.user.id)
            .eq('playlist_id', playlistId)
            .single();

        return !!data;
    },

    async isArtistFollowed(artistId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;

        const { data } = await supabase
            .from('artist_follows')
            .select('artist_id')
            .eq('user_id', session.user.id)
            .eq('artist_id', artistId)
            .single();

        return !!data;
    },

    async isPodcastFollowed(podcastId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;

        const { data } = await supabase
            .from('podcast_follows')
            .select('podcast_id')
            .eq('user_id', session.user.id)
            .eq('podcast_id', podcastId)
            .single();

        return !!data;
    }
};
