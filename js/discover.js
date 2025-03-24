import { supabase, getPagePath } from './supabase.js';

class DiscoverUI {
    constructor() {
        this.loadContent();
    }

    async loadContent() {
        try {
            await Promise.all([
                this.loadFeatured(),
                this.loadNewReleases(),
                this.loadPopularArtists(),
                this.loadFeaturedPlaylists(),
                this.loadGenres(),
                this.loadPopularPodcasts(),
                this.loadMoodMixes(),
                this.loadCharts()
            ]);
        } catch (error) {
            console.error('Failed to load content:', error);
        }
    }

    async loadFeatured() {
        const { data: featured } = await supabase
            .from('home_featured')
            .select('*')
            .eq('active', true)
            .limit(6);

        const container = document.querySelector('[data-content="featured"]');
        if (container) {
            if (!featured?.length) {
                container.innerHTML = '<p>No featured content available</p>';
                return;
            }
            container.innerHTML = featured.map(item => `
                <div class="featured-card" onclick="window.location.href='${getPagePath(item.link)}'">
                    <div class="featured-img" style="background-image: url('${item.image_url}')">
                        <div class="featured-overlay">
                            <h3>${item.title}</h3>
                            <p>${item.description}</p>
                            <span class="featured-tag">${item.type}</span>
                        </div>
                    </div>
                </div>
            `).join('');
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
            container.innerHTML = releases.map(release => {
                const releaseDate = new Date(release.release_date);
                const formattedDate = releaseDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                
                return `
                    <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/release')}?id=${release.id}'">
                        <div class="playlist-img" style="background-image: url('${release.cover_url}')"></div>
                        <h3>${release.title}</h3>
                        <p>${release.artists.name}</p>
                        <span class="release-date">${formattedDate}</span>
                    </div>
                `;
            }).join('');
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

    async loadGenres() {
        const { data: genres } = await supabase
            .from('genres')
            .select('*')
            .eq('status', 'active')
            .order('name');

        const container = document.querySelector('[data-content="genres"]');
        if (container && genres?.length) {
            container.innerHTML = genres.map(genre => `
                <div class="genre-card" onclick="window.location.href='${getPagePath('/pages/genre')}?id=${genre.id}'">
                    <div class="genre-img" style="background-image: url('${genre.image_url}')">
                        <h3>${genre.name}</h3>
                    </div>
                </div>
            `).join('');
        }
    }

    async loadPopularPodcasts() {
        try {
            const { data: podcasts } = await supabase
                .from('podcasts')
                .select('*')
                .eq('status', 'published')
                .order('updated_at', { ascending: false })
                .limit(6);

            const container = document.querySelector('[data-content="podcasts"]');
            if (container) {
                if (!podcasts?.length) {
                    container.innerHTML = '<p>No podcasts available</p>';
                    return;
                }
                container.innerHTML = podcasts.map(podcast => `
                    <div class="podcast-card" onclick="window.location.href='${getPagePath('/pages/podcast')}?id=${podcast.id}'">
                        <div class="podcast-img" style="background-image: url('${podcast.image_url}')"></div>
                        <h3>${podcast.title}</h3>
                        <p>${podcast.description || ''}</p>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Failed to load podcasts:', error);
            // Add error handling UI if needed
        }
    }

    async loadMoodMixes() {
        const { data: moods } = await supabase
            .from('playlists')
            .select('*')
            .eq('status', 'published')
            .eq('is_mood_playlist', true)
            .limit(6);

        const container = document.querySelector('[data-content="moods"]');
        if (container && moods?.length) {
            container.innerHTML = moods.map(mood => `
                <div class="mood-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${mood.id}'">
                    <div class="mood-img" style="background-image: url('${mood.cover_url}')">
                        <div class="mood-overlay">
                            <h3>${mood.name}</h3>
                            <p>${mood.description}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    async loadCharts() {
        // Get Top 100 first
        const { data: top100 } = await supabase
            .from('charts')
            .select(`
                *,
                chart_entries (
                    position,
                    songs (
                        id, title, cover_url,
                        artists (name)
                    )
                )
            `)
            .eq('name', 'Top 100')
            .single();

        // Then get other charts
        const { data: charts } = await supabase
            .from('playlists')
            .select(`
                *,
                playlist_songs (
                    songs (
                        id, title, cover_url,
                        artists (name)
                    )
                )
            `)
            .eq('status', 'published')
            .eq('is_chart', true)
            .limit(4);

        const container = document.querySelector('[data-content="charts"]');
        if (container) {
            container.innerHTML = `
                ${top100 ? `
                    <div class="chart-card large" onclick="window.location.href='${getPagePath('/pages/chart')}?id=${top100.id}'">
                        <div class="chart-content">
                            <div class="chart-info">
                                <h3>${top100.name}</h3>
                                <p>The hottest tracks right now</p>
                            </div>
                            <div class="chart-preview">
                                <div class="chart-tracks">
                                    ${top100.chart_entries?.slice(0, 3).map((entry, i) => `
                                        <div class="chart-track">
                                            <span class="rank">${entry.position}</span>
                                            <img src="${entry.songs.cover_url}" alt="${entry.songs.title}">
                                            <div class="track-info">
                                                <h4>${entry.songs.title}</h4>
                                                <p>${entry.songs.artists.name}</p>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}
                ${charts?.map(chart => `
                    <div class="chart-card" onclick="window.location.href='${getPagePath('/pages/chart')}?id=${chart.id}'">
                        <div class="chart-content">
                            <div class="chart-info">
                                <h3>${chart.name}</h3>
                                <p>${chart.description}</p>
                            </div>
                            <div class="chart-preview">
                                <div class="chart-tracks">
                                    ${chart.preview_tracks.map((track, i) => `
                                        <div class="chart-track">
                                            <span class="rank">${i + 1}</span>
                                            <img src="${track.cover_url}" alt="${track.title}">
                                            <div class="track-info">
                                                <h4>${track.title}</h4>
                                                <p>${track.artist}</p>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DiscoverUI();
});
