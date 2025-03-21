import { supabase, getPagePath } from './supabase.js';

class LibraryUI {
    constructor() {
        this.loadContent();
    }

    async loadContent() {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            window.location.href = getPagePath('/auth/login');
            return;
        }

        await Promise.all([
            this.loadUserPlaylists(session.user.id),
            this.loadLikedSongs(session.user.id),
            this.loadRecentlyPlayed(session.user.id),
            this.loadFollowedPodcasts(session.user.id) // Add this
        ]);
    }

    async loadUserPlaylists(userId) {
        const { data: playlists } = await supabase
            .from('playlists')
            .select('*, playlist_songs(count)')
            .eq('creator_id', userId)
            .order('created_at', { ascending: false });

        const container = document.querySelector('[data-content="my-playlists"]');
        if (container) {
            const createPlaylistBtn = `
                <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/create-playlist')}'">
                    <div class="playlist-img gradient-purple">
                        <i class="fas fa-plus" style="font-size: 2rem; color: white; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"></i>
                    </div>
                    <h3>Create New Playlist</h3>
                    <p>Start a new collection</p>
                </div>
            `;

            container.innerHTML = createPlaylistBtn + (playlists?.map(playlist => `
                <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>${playlist.description || `${playlist.playlist_songs[0]?.count || 0} songs`}</p>
                    <span class="playlist-privacy">${playlist.is_public ? 'Public' : 'Private'}</span>
                </div>
            `).join('') || '');
        }
    }

    async loadLikedSongs(userId) {
        const { data: likes } = await supabase
            .from('likes')
            .select(`
                songs (
                    id,
                    title,
                    duration,
                    audio_url,
                    cover_url,
                    artists (name)
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        const container = document.querySelector('[data-content="liked-songs"]');
        if (container) {
            container.style.cursor = 'pointer';
            container.onclick = () => {
                window.location.href = getPagePath('/pages/playlist') + '?type=liked';
            };
            const img = container.querySelector('.playlist-img');
            img.classList.remove('gradient-purple');
            img.style.backgroundImage = `url('https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/your%20liked%20list.png')`;
            if (likes?.length > 0) {
                container.querySelector('.song-count').textContent = `${likes.length} liked songs`;
            }
        }
    }

    async loadRecentlyPlayed(userId) {
        const { data: history } = await supabase
            .from('play_history')
            .select(`
                songs (
                    id,
                    title,
                    duration,
                    audio_url,
                    cover_url,
                    artists (name)
                )
            `)
            .eq('user_id', userId)
            .order('played_at', { ascending: false });

        const container = document.querySelector('[data-content="recently-played"]');
        if (container) {
            // Process signed URLs before displaying
            const processedTracks = await Promise.all(history?.map(async (item) => {
                const track = item.songs;
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
            }) || []);

            container.style.cursor = 'pointer';
            container.onclick = () => {
                window.location.href = getPagePath('/pages/playlist') + '?type=recent';
            };

            const img = container.querySelector('.playlist-img');
            img.classList.remove('gradient-blue');
            img.style.backgroundImage = `url('https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/recently%20played.png')`;
            
            if (history?.length > 0) {
                container.querySelector('.song-count').textContent = `${history.length} recently played`;
            }
        }
    }

    async loadFollowedPodcasts(userId) {
        const { data: follows } = await supabase
            .from('podcast_follows')
            .select(`
                podcast:podcast_id (
                    id,
                    title,
                    description,
                    image_url,
                    podcast_episodes(count)
                )
            `)
            .eq('user_id', userId);

        const container = document.querySelector('[data-content="podcasts"]');
        if (container) {
            container.innerHTML = follows?.map(({ podcast }) => `
                <div class="podcast-card" onclick="window.location.href='${getPagePath('/pages/podcast')}?id=${podcast.id}'">
                    <div class="podcast-img" style="background-image: url('${podcast.image_url}')"></div>
                    <h3>${podcast.title}</h3>
                    <p>${podcast.podcast_episodes[0]?.count || 0} episodes</p>
                </div>
            `).join('') || '<p>No followed podcasts</p>';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LibraryUI();
});
