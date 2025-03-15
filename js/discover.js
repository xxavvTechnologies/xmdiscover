import { supabase, getPagePath } from './supabase.js';

class DiscoverUI {
    constructor() {
        this.loadContent();
    }

    async loadContent() {
        try {
            await Promise.all([
                this.loadNewReleases(),
                this.loadPopularArtists(),
                this.loadFeaturedPlaylists()
            ]);
        } catch (error) {
            console.error('Failed to load discover content:', error);
        }
    }

    async loadNewReleases() {
        const { data: releases } = await supabase
            .from('albums')
            .select(`
                *,
                artists (
                    name,
                    genres
                )
            `)
            .eq('status', 'published')
            .order('release_date', { ascending: false })
            .limit(6);

        const container = document.querySelector('[data-content="new-releases"]');
        if (container && releases) {
            container.innerHTML = releases.map(release => `
                <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/release')}?id=${release.id}'">
                    <div class="playlist-img" style="background-image: url('${release.cover_url}')"></div>
                    <h3>${release.title}</h3>
                    <p>${release.artists.name}</p>
                </div>
            `).join('');
        }
    }

    async loadPopularArtists() {
        try {
            const { data: artists } = await supabase
                .from('artists')
                .select('*')
                .eq('status', 'published')
                .order('created_at', { ascending: false }) // Fallback to created_at if popularity not ready
                .limit(6);

            const container = document.querySelector('[data-content="artists"]');
            if (container) {
                if (!artists || artists.length === 0) {
                    container.innerHTML = '<p>No artists available</p>';
                    return;
                }
                container.innerHTML = artists.map(artist => `
                    <div class="artist-card" onclick="window.location.href='${getPagePath('/pages/artist')}?id=${artist.id}'">
                        <div class="artist-img" style="background-image: url('${artist.image_url}')"></div>
                        <h3>${artist.name}</h3>
                        <p>${artist.genres?.join(', ') || ''}</p>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Failed to load artists:', error);
            // Add error handling UI if needed
        }
    }

    async loadFeaturedPlaylists() {
        try {
            const { data: playlists } = await supabase
                .from('playlists')
                .select(`
                    *,
                    profiles (
                        username,
                        display_name
                    )
                `)
                .eq('status', 'published')
                .eq('is_public', true) // Add this filter
                .limit(6);

            const container = document.querySelector('[data-content="playlists"]');
            if (container) {
                if (!playlists || playlists.length === 0) {
                    container.innerHTML = '<p>No playlists available</p>';
                    return;
                }
                container.innerHTML = playlists.map(playlist => `
                    <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'">
                        <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                        <h3>${playlist.name}</h3>
                        <p>Created by ${playlist.profiles.display_name || playlist.profiles.username}</p>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Failed to load playlists:', error);
            // Add error handling UI if needed
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DiscoverUI();
});
