import { supabase, getPagePath } from '../supabase.js';

class BrowsePage {
    constructor() {
        this.type = new URLSearchParams(window.location.search).get('type') || 'featured';
        this.sortSelect = document.getElementById('sort-select');
        this.setupEventListeners();
        this.loadContent();
    }

    setupEventListeners() {
        this.sortSelect?.addEventListener('change', () => this.loadContent());
    }

    async loadContent() {
        try {
            const container = document.querySelector('.browse-content');
            if (!container) return;

            document.querySelector('h1').textContent = this.getPageTitle();

            switch (this.type) {
                case 'featured':
                    await this.loadFeatured(container);
                    break;
                case 'releases':
                    await this.loadReleases(container);
                    break;
                case 'artists':
                    await this.loadArtists(container);
                    break;
                case 'playlists':
                    await this.loadPlaylists(container);
                    break;
                case 'genres':
                    await this.loadGenres(container);
                    break;
                case 'moods':
                    await this.loadMoodMixes(container);
                    break;
                case 'charts':
                    await this.loadCharts(container);
                    break;
                default:
                    container.innerHTML = '<p>Invalid category</p>';
            }
        } catch (error) {
            console.error('Failed to load content:', error);
            document.querySelector('.browse-content').innerHTML = '<p>Failed to load content</p>';
        }
    }

    getPageTitle() {
        const titles = {
            featured: 'Featured Content',
            releases: 'New Releases',
            artists: 'Popular Artists',
            playlists: 'Featured Playlists',
            genres: 'Browse by Genre',
            moods: 'Mood Mixes',
            charts: 'Top Charts'
        };
        return titles[this.type] || 'Browse';
    }

    // Loading methods for each content type
    async loadFeatured(container) {
        const { data } = await supabase
            .from('home_featured')
            .select('*')
            .eq('active', true)
            .order('created_at', { ascending: false });

        this.renderFeatured(container, data);
    }

    async loadReleases(container) {
        const { data } = await supabase
            .from('albums')
            .select('*, artists(name)')
            .eq('status', 'published')
            .order(this.getSortColumn(), { ascending: this.sortSelect.value === 'name' });

        this.renderReleases(container, data);
    }

    async loadArtists(container) {
        const { data } = await supabase
            .from('artists')
            .select('*')
            .eq('status', 'published')
            .order(this.getSortColumn(), { ascending: this.sortSelect.value === 'name' });

        this.renderArtists(container, data);
    }

    async loadPlaylists(container) {
        const { data } = await supabase
            .from('playlists')
            .select('*, profiles(username, display_name)')
            .eq('status', 'published')
            .eq('is_public', true)
            .order(this.getSortColumn(), { ascending: this.sortSelect.value === 'name' });

        this.renderPlaylists(container, data);
    }

    async loadGenres(container) {
        const { data: genres } = await supabase
            .from('genres')
            .select('*, parent_genre:parent_id(name)')
            .eq('status', 'active')
            .order('name');

        this.renderGenres(container, genres);
    }

    async loadMoodMixes(container) {
        const { data: moods } = await supabase
            .from('moods')
            .select(`
                *,
                mood_songs (
                    songs (
                        id, title, cover_url,
                        artists (name)
                    )
                )
            `)
            .eq('status', 'active')
            .order('name');

        this.renderMoodMixes(container, moods);
    }

    async loadCharts(container) {
        // First get the Top 100 chart
        const { data: top100 } = await supabase
            .from('charts')
            .select(`
                *,
                chart_entries (
                    songs (
                        id, title, cover_url,
                        artists (name)
                    )
                )
            `)
            .eq('type', 'weekly')
            .single();

        // Then get other charts
        const { data: charts } = await supabase
            .from('charts')
            .select(`
                *,
                chart_entries (
                    songs (
                        id, title, cover_url,
                        artists (name)
                    )
                )
            `)
            .neq('type', 'weekly')
            .eq('status', 'active')
            .order('updated_at', { ascending: false });

        this.renderCharts(container, { top100, charts });
    }

    // Render methods for each content type
    renderFeatured(container, items) {
        container.innerHTML = `
            <div class="featured-grid">
                ${items?.map(item => `
                    <div class="featured-card" onclick="window.location.href='${getPagePath(item.link)}'">
                        <div class="featured-img" style="background-image: url('${item.image_url}')">
                            <div class="featured-overlay">
                                <h3>${item.title}</h3>
                                <p>${item.description}</p>
                                <span class="featured-tag">${item.type}</span>
                            </div>
                        </div>
                    </div>
                `).join('') || '<p>No featured content available</p>'}
            </div>
        `;
    }

    renderReleases(container, releases) {
        container.innerHTML = `
            <div class="release-grid">
                ${releases?.map(release => `
                    <div class="release-card" onclick="window.location.href='${getPagePath('/pages/release')}?id=${release.id}'">
                        <div class="release-img" style="background-image: url('${release.cover_url}')"></div>
                        <h3>${release.title}</h3>
                        <p>${release.artists?.name || 'Unknown Artist'}</p>
                    </div>
                `).join('') || '<p>No releases available</p>'}
            </div>
        `;
    }

    renderArtists(container, artists) {
        container.innerHTML = `
            <div class="artist-grid">
                ${artists?.map(artist => `
                    <div class="artist-card" onclick="window.location.href='${getPagePath('/pages/artist')}?id=${artist.id}'">
                        <div class="artist-img" style="background-image: url('${artist.image_url}')"></div>
                        <h3>${artist.name}</h3>
                        <p>${artist.genres?.join(', ') || ''}</p>
                    </div>
                `).join('') || '<p>No artists available</p>'}
            </div>
        `;
    }

    renderPlaylists(container, playlists) {
        container.innerHTML = `
            <div class="playlist-grid">
                ${playlists?.map(playlist => `
                    <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'">
                        <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                        <h3>${playlist.name}</h3>
                        <p>By ${playlist.profiles?.display_name || playlist.profiles?.username || 'Unknown'}</p>
                    </div>
                `).join('') || '<p>No playlists available</p>'}
            </div>
        `;
    }

    renderGenres(container, genres) {
        container.innerHTML = `
            <div class="genre-grid">
                ${genres?.map(genre => `
                    <div class="genre-card" onclick="window.location.href='${getPagePath('/pages/genre')}?id=${genre.id}'">
                        <div class="genre-img" style="background-image: url('${genre.image_url}')">
                            <h3>${genre.name}</h3>
                        </div>
                    </div>
                `).join('') || '<p>No genres available</p>'}
            </div>
        `;
    }

    renderMoodMixes(container, moods) {
        container.innerHTML = `
            <div class="mood-grid">
                ${moods?.map(mood => `
                    <div class="mood-card" onclick="window.location.href='${getPagePath('/pages/mood')}?id=${mood.id}'">
                        <div class="mood-img" style="background-color: ${mood.color || '#8c52ff'}">
                            <img src="${mood.cover_url || ''}" alt="${mood.name}">
                            <div class="mood-overlay">
                                <h3>${mood.name}</h3>
                                <p>${mood.description || ''}</p>
                                <span class="song-count">${mood.mood_songs?.length || 0} songs</span>
                            </div>
                        </div>
                    </div>
                `).join('') || '<p>No mood mixes available</p>'}
            </div>
        `;
    }

    renderCharts(container, { top100, charts }) {
        container.innerHTML = `
            ${top100 ? `
                <div class="top-100-section">
                    <h2>Top 100</h2>
                    <div class="chart-card featured" onclick="window.location.href='${getPagePath('/pages/chart')}?id=${top100.id}'">
                        <div class="chart-img" style="background-image: url('${top100.cover_url}')">
                            <div class="chart-overlay">
                                <h3>${top100.name}</h3>
                                <p>${top100.description || ''}</p>
                                <span class="track-count">${top100.chart_entries?.length || 0} tracks</span>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <div class="charts-grid">
                ${charts?.map(chart => `
                    <div class="chart-card" onclick="window.location.href='${getPagePath('/pages/chart')}?id=${chart.id}'">
                        <div class="chart-img" style="background-image: url('${chart.cover_url}')">
                            <div class="chart-overlay">
                                <h3>${chart.name}</h3>
                                <p>${chart.description || ''}</p>
                                <span class="badge">${chart.type}</span>
                                <span class="track-count">${chart.chart_entries?.length || 0} tracks</span>
                            </div>
                        </div>
                    </div>
                `).join('') || '<p>No charts available</p>'}
            </div>
        `;
    }

    getSortColumn() {
        switch (this.sortSelect.value) {
            case 'recent':
                return 'created_at';
            case 'name':
                return this.type === 'artists' ? 'name' : 'title';
            case 'popular':
                return 'play_count';
            default:
                return 'created_at';
        }
    }

    // Add other render methods similarly for artists, playlists, genres, moods, charts
}

document.addEventListener('DOMContentLoaded', () => {
    new BrowsePage();
});
