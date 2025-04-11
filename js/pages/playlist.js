import { supabase, getPagePath } from '../supabase.js';
import { updateMetaTags } from '../seo.js';
import { PlayerStateManager } from '../services/playerState.js';

class PlaylistPage {
    constructor() {
        this.playlistId = new URLSearchParams(window.location.search).get('id');
        this.playlistType = new URLSearchParams(window.location.search).get('type');
        
        if (!this.playlistId && !this.playlistType) {
            window.location.href = getPagePath('/discover');
            return;
        }
        
        if (this.playlistType) {
            this.loadSystemPlaylist(this.playlistType);
        } else {
            this.loadPlaylist();
        }
    }

    async loadSystemPlaylist(type) {
        try {
            switch(type) {
                case 'liked':
                    await this.loadLikedSongs();
                    break;
                case 'recent':
                    await this.loadRecentlyPlayed();
                    break;
                case 'podcasts':
                    await this.loadSavedPodcasts();
                    break;
                default:
                    throw new Error('Invalid playlist type');
            }
        } catch (error) {
            console.error('Failed to load system playlist:', error);
            alert('Failed to load playlist');
            window.location.href = getPagePath('/library');
        }
    }

    async loadLikedSongs() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const { data: likes, error } = await supabase
            .from('likes')
            .select(`
                song:song_id (
                    id,
                    title,
                    duration,
                    audio_url,
                    cover_url,
                    artists (
                        id,
                        name
                    )
                )
            `)
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading likes:', error);
            throw error;
        }

        // Process the tracks for UI display
        const tracks = likes?.map(like => ({
            id: like.song.id,
            title: like.song.title,
            duration: like.song.duration,
            audioUrl: like.song.audio_url,
            coverUrl: like.song.cover_url,
            artist: like.song.artists.name,
            artistId: like.song.artists.id
        }));

        this.updateSystemPlaylistUI('Liked Songs', 'Your favorite tracks', tracks || []);
    }

    async loadRecentlyPlayed() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const { data: history } = await supabase
            .from('play_history')
            .select(`
                songs (
                    id,
                    title,
                    duration,
                    cover_url,
                    artists (name)
                )
            `)
            .eq('user_id', session.user.id)
            .order('played_at', { ascending: false });

        this.updateSystemPlaylistUI('Recently Played', 'Your listening history', history?.map(item => item.songs));
    }

    async loadSavedPodcasts() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        // Get saved episodes with podcast info
        const { data: savedEpisodes } = await supabase
            .from('saved_episodes')
            .select(`
                episode:episode_id (
                    id,
                    title,
                    audio_url,
                    duration,
                    published_at,
                    podcasts (
                        id,
                        title,
                        image_url
                    )
                )
            `)
            .eq('user_id', session.user.id)
            .order('saved_at', { ascending: false });

        this.updateSystemPlaylistUI(
            'Saved Episodes',
            'Your podcast episodes for later',
            savedEpisodes?.map(item => ({
                id: item.episode.id,
                title: item.episode.title,
                audioUrl: item.episode.audio_url,
                duration: item.episode.duration,
                coverUrl: item.episode.podcasts.image_url,
                artist: item.episode.podcasts.title,
                publishedAt: item.episode.published_at,
                type: 'podcast'
            }))
        );
    }

    updateSystemPlaylistUI(title, description, tracks) {
        document.title = `${title} - xM DiScover`;
        document.querySelector('.playlist-title').textContent = title;
        document.querySelector('.playlist-creator').textContent = description;
        
        // Set playlist cover based on type
        const coverImage = document.querySelector('.playlist-image');
        coverImage.classList.remove('gradient-purple', 'gradient-blue');
        
        const coverUrls = {
            liked: 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/your%20liked%20list.png',
            recent: 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/recently%20played.png',
            podcasts: 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/saved%20for%20later.png'
        };

        const coverUrl = coverUrls[this.playlistType] || coverUrls.liked;
        coverImage.style.backgroundImage = `url('${coverUrl}')`;

        const container = document.querySelector('.track-list');
        if (container && tracks) {
            container.innerHTML = tracks.map((track, index) => {
                // Format date for podcasts
                const dateInfo = track.type === 'podcast' ? 
                    `<span class="publish-date">${new Date(track.publishedAt).toLocaleDateString()}</span> • ` :
                    '';

                return `
                    <div class="track-item" data-track-id="${track.id}">
                        <span class="track-number">${index + 1}</span>
                        <img src="${track.coverUrl}" alt="${track.title}" width="40" height="40">
                        <div class="track-info">
                            <h4>${track.title}</h4>
                            <p>${track.artist}</p>
                            <div class="track-meta">
                                ${dateInfo}
                                <span class="track-duration">${track.duration || ''}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            document.querySelector('.playlist-tracks').textContent = 
                `${tracks.length} ${tracks[0]?.type === 'podcast' ? 'episodes' : 'tracks'}`;

            // Add play handlers with track type
            container.querySelectorAll('.track-item').forEach((item, index) => {
                item.addEventListener('click', () => {
                    const track = tracks[index];
                    const playEvent = new CustomEvent('xm-play-track', {
                        detail: {
                            ...track,
                            audioUrl: track.audioUrl || track.audio_url,
                            coverUrl: track.coverUrl || track.cover_url,
                        }
                    });
                    document.dispatchEvent(playEvent);
                });
            });
        }
    }

    async loadPlaylist() {
        try {
            const { data: playlist } = await supabase
                .from('playlists')
                .select(`
                    *,
                    profiles (
                        username,
                        display_name
                    )
                `)
                .eq('id', this.playlistId)
                .single();

            if (!playlist) throw new Error('Playlist not found');

            await updateMetaTags('playlist', playlist);
            this.updateUI(playlist);
            await Promise.all([
                this.loadTracks(playlist.id),
                this.loadSimilarPlaylists(playlist)
            ]);
        } catch (error) {
            console.error('Failed to load playlist:', error);
            alert('Playlist not found');
            window.location.href = '/discover.html';
        }
    }

    updateUI(playlist) {
        document.title = `${playlist.name} - xM DiScover`;
        document.querySelector('.playlist-title').textContent = playlist.name;
        document.querySelector('.playlist-creator').textContent = 
            `Created by ${playlist.profiles.display_name || playlist.profiles.username}`;
        
        if (playlist.cover_url) {
            document.querySelector('.playlist-image').style.backgroundImage = `url('${playlist.cover_url}')`;
        }

        if (playlist.description) {
            const meta = document.querySelector('.playlist-meta');
            meta.insertAdjacentHTML('afterbegin', `<p class="playlist-description">${playlist.description}</p>`);
        }
    }

    async loadTracks() {
        const { data: tracks } = await supabase
            .from('playlist_songs')
            .select(`
                songs (
                    id,
                    title,
                    duration,
                    audio_url,
                    cover_url,
                    artists (
                        id,
                        name
                    )
                )
            `)
            .eq('playlist_id', this.playlistId)
            .order('position', { ascending: true });

        const container = document.querySelector('.track-list');
        if (container && tracks) {
            // Get signed URLs for all tracks
            const processedTracks = await Promise.all(tracks.map(async ({ songs: track }) => {
                if (track.audio_url?.includes('supabase.co/storage')) {
                    const urlParts = track.audio_url.split('/storage/v1/object/');
                    if (urlParts.length === 2) {
                        const pathPart = urlParts[1].replace(/^(public|sign)\//, '');
                        const cleanPath = pathPart.split('?')[0];
                        
                        const { data } = await supabase.storage
                            .from(cleanPath.split('/')[0])
                            .createSignedUrl(
                                cleanPath.split('/').slice(1).join('/'),
                                3600
                            );
                        
                        if (data?.signedUrl) {
                            track.audio_url = data.signedUrl;
                        }
                    }
                }
                return track;
            }));

            // Display tracks
            container.innerHTML = processedTracks.map((track, index) => `
                <div class="track-item" data-track-id="${track.id}">
                    <span class="track-number">${index + 1}</span>
                    <img src="${track.cover_url}" alt="${track.title}" width="40" height="40">
                    <div class="track-info">
                        <h4>${track.title}</h4>
                        <p>${track.artists.name}</p>
                    </div>
                    <span class="track-duration">${track.duration}</span>
                </div>
            `).join('');

            // Add click handlers for tracks
            container.querySelectorAll('.track-item').forEach((item, index) => {
                item.addEventListener('click', () => {
                    const track = processedTracks[index];
                    if (!track) return;
                    
                    const standardTrack = PlayerStateManager.standardizeTrackInfo(track);
                    document.dispatchEvent(new CustomEvent('xm-play-track', {
                        detail: standardTrack
                    }));
                });
            });
        }
    }

    async loadSimilarPlaylists(currentPlaylist) {
        const { data: playlists } = await supabase
            .from('playlists')
            .select('*')
            .eq('status', 'published')
            .neq('id', this.playlistId)
            // You could add more filters here based on genres or other criteria
            .limit(6);

        const container = document.querySelector('.playlist-grid');
        if (container && playlists) {
            container.innerHTML = playlists.map(playlist => `
                <div class="playlist-card" onclick="window.location.href='/pages/playlist.html?id=${playlist.id}'">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>${playlist.description || ''}</p>
                </div>
            `).join('');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PlaylistPage();
});
