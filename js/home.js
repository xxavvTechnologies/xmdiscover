import { supabase, getPagePath } from './supabase.js';
import { PlayerStateManager } from './services/playerState.js';

class HomeUI {
    constructor() {
        this.trendingType = 'songs';
        this.setupEventListeners();
        this.loadContent();
    }

    setupEventListeners() {
        document.querySelectorAll('.trend-category').forEach(btn => {
            btn.addEventListener('click', () => {
                this.trendingType = btn.classList[1];
                document.querySelectorAll('.trend-category').forEach(b => 
                    b.classList.toggle('active', b === btn));
                this.loadTrending();
            });
        });
    }

    async loadContent() {
        try {
            await Promise.all([
                this.loadFeatured(),
                this.loadTrending(),
                this.loadMoodMixes(),
                this.loadNewReleases(),
                this.loadPodcasts()
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
            .limit(4);

        if (featured?.length) {
            // Load main feature
            const mainFeature = featured[0];
            const mainContainer = document.querySelector('[data-content="featured-large"]');
            if (mainContainer) {
                mainContainer.style.backgroundImage = `url('${mainFeature.image_url}')`;
                mainContainer.innerHTML = `
                    <div class="highlight-overlay">
                        <span class="highlight-tag">${mainFeature.type}</span>
                        <h3>${mainFeature.title}</h3>
                        <p>${mainFeature.description}</p>
                    </div>
                `;
                mainContainer.onclick = () => window.location.href = mainFeature.link;
            }

            // Load secondary features
            const listContainer = document.querySelector('[data-content="featured-small"]');
            if (listContainer) {
                listContainer.innerHTML = featured.slice(1).map(item => `
                    <div class="highlight-item" onclick="window.location.href='${item.link}'">
                        <div class="highlight-image" style="background-image: url('${item.image_url}')"></div>
                        <div class="highlight-info">
                            <span class="highlight-tag">${item.type}</span>
                            <h4>${item.title}</h4>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    async loadTrending() {
        const container = document.querySelector('[data-content="trending"]');
        if (!container) return;

        try {
            let query;
            switch (this.trendingType) {
                case 'songs':
                    query = supabase
                        .from('songs')
                        .select('*, artists(name)')
                        .eq('status', 'published')
                        .limit(6);
                    break;
                case 'artists':
                    query = supabase
                        .from('artists')
                        .select('*')
                        .eq('status', 'published')
                        .limit(6);
                    break;
                case 'albums':
                    query = supabase
                        .from('albums')
                        .select('*, artists(name)')
                        .eq('status', 'published')
                        .limit(6);
                    break;
            }

            const { data: items } = await query;
            
            if (!items?.length) {
                container.innerHTML = '<p>No trending content available</p>';
                return;
            }

            container.innerHTML = items.map(item => {
                switch (this.trendingType) {
                    case 'songs':
                        return `
                            <div class="track-item" data-id="${item.id}">
                                <img src="${item.cover_url}" alt="${item.title}">
                                <div class="track-info">
                                    <h4>${item.title}</h4>
                                    <p>${item.artists.name}</p>
                                </div>
                            </div>`;
                    case 'artists':
                        return `
                            <div class="artist-card" onclick="window.location.href='${getPagePath('/pages/artist')}?id=${item.id}'">
                                <div class="artist-img" style="background-image: url('${item.image_url}')"></div>
                                <h3>${item.name}</h3>
                            </div>`;
                    case 'albums':
                        return `
                            <div class="release-card" onclick="window.location.href='${getPagePath('/pages/release')}?id=${item.id}'">
                                <div class="release-img" style="background-image: url('${item.cover_url}')"></div>
                                <h3>${item.title}</h3>
                                <p>${item.artists.name}</p>
                            </div>`;
                }
            }).join('');

        } catch (error) {
            console.error('Failed to load trending content:', error);
            container.innerHTML = '<p>Failed to load trending content</p>';
        }
    }

    async loadMoodMixes() {
        const { data: moods } = await supabase
            .from('moods')
            .select(`
                *,
                mood_songs (
                    songs (
                        id, title,
                        artists (name)
                    )
                )
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(6);

        const container = document.querySelector('[data-content="moods"]');
        if (container && moods?.length) {
            container.innerHTML = moods.map(mood => `
                <div class="mood-card" onclick="window.location.href='${getPagePath('/pages/mood')}?id=${mood.id}'">
                    <div class="mood-img" style="background-color: ${mood.color || '#8c52ff'}">
                        <img src="${mood.cover_url || ''}" alt="${mood.name}">
                    </div>
                    <h3>${mood.name}</h3>
                    <p>${mood.description || ''}</p>
                    <span class="song-count">${mood.mood_songs?.length || 0} songs</span>
                </div>
            `).join('');
        }
    }

    async loadNewReleases() {
        const { data: releases } = await supabase
            .from('albums')
            .select('*, artists(name)')
            .eq('status', 'published')
            .order('release_date', { ascending: false })
            .limit(8);

        const container = document.querySelector('[data-content="new-releases"]');
        if (container && releases?.length) {
            container.innerHTML = releases.map(release => `
                <div class="release-card" onclick="window.location.href='${getPagePath('/pages/release')}?id=${release.id}'">
                    <div class="release-img" style="background-image: url('${release.cover_url}')"></div>
                    <h3>${release.title}</h3>
                    <p>${release.artists.name}</p>
                </div>
            `).join('');
        }
    }

    async loadPodcasts() {
        const { data: podcasts } = await supabase
            .from('podcasts')
            .select('*')
            .eq('status', 'published')
            .limit(6);

        const container = document.querySelector('[data-content="podcasts"]');
        if (container && podcasts?.length) {
            container.innerHTML = podcasts.map(podcast => `
                <div class="podcast-card" onclick="window.location.href='${getPagePath('/pages/podcast')}?id=${podcast.id}'">
                    <div class="podcast-img" style="background-image: url('${podcast.image_url}')"></div>
                    <h3>${podcast.title}</h3>
                    <p>${podcast.description || ''}</p>
                </div>
            `).join('');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HomeUI();
});
