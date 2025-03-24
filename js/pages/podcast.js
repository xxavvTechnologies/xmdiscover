import { supabase, getPagePath } from '../supabase.js';
import { FollowService } from '../services/follow.js';

class PodcastPage {
    constructor() {
        this.podcastId = new URLSearchParams(window.location.search).get('id');
        if (!this.podcastId) {
            window.location.href = getPagePath('/discover');
            return;
        }
        this.loadPodcast();
    }

    async loadPodcast() {
        try {
            const { data: podcast } = await supabase
                .from('podcasts')
                .select('*')
                .eq('id', this.podcastId)
                .single();

            if (!podcast) throw new Error('Podcast not found');

            document.title = `${podcast.title} - xM DiScover`;
            document.querySelector('.podcast-title').textContent = podcast.title;
            document.querySelector('.podcast-description').textContent = podcast.description;
            document.querySelector('.podcast-image').style.backgroundImage = `url('${podcast.image_url}')`;

            // Add follow button
            const isFollowed = await FollowService.isPodcastFollowed(podcast.id);
            this.addFollowButton(podcast.id, isFollowed);

            const { data: episodes } = await supabase
                .from('podcast_episodes')
                .select('*')
                .eq('podcast_id', this.podcastId)
                .order('episode_number', { ascending: false }); // Changed to false

            const container = document.querySelector('.episode-list');
            if (container && episodes?.length) {
                // Get saved episodes for current user
                const { data: savedEpisodes } = await supabase
                    .from('saved_episodes')
                    .select('episode_id')
                    .eq('user_id', (await supabase.auth.getSession()).data.session?.user?.id);

                const savedEpisodeIds = new Set(savedEpisodes?.map(e => e.episode_id) || []);

                container.innerHTML = episodes.map((episode, index) => {
                    // Format date
                    const publishDate = new Date(episode.published_at);
                    const formattedDate = publishDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });

                    // Format episode info
                    const seasonEpisode = episode.season_number ? 
                        `S${episode.season_number}:E${episode.episode_number}` : 
                        `Episode ${episode.episode_number || (episodes.length - index)}`;

                    return `
                        <div class="episode-item ${index === 0 ? 'latest' : ''}" data-episode-id="${episode.id}">
                            <div class="episode-number">
                                <div class="episode-season">${seasonEpisode}</div>
                            </div>
                            <div class="episode-info">
                                <h3>${episode.title}</h3>
                                <button class="show-description">
                                    Show Description
                                    <i class="ri-arrow-down-s-line"></i>
                                </button>
                                <div class="episode-description">
                                    ${episode.description || 'No description available.'}
                                </div>
                                <div class="episode-meta">
                                    <span class="publish-date">${formattedDate}</span>
                                    •
                                    <span>${episode.duration || '00:00'}</span>
                                    ${index === 0 ? '<span class="latest-badge">Latest</span>' : ''}
                                </div>
                            </div>
                            <div class="episode-actions">
                                <button class="save-episode ${savedEpisodeIds.has(episode.id) ? 'saved' : ''}" 
                                        title="Save for Later">
                                    <i class="ri-bookmark-${savedEpisodeIds.has(episode.id) ? 'fill' : 'line'}"></i>
                                </button>
                                <button class="play-episode" title="Play Episode">
                                    <i class="ri-play-fill"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                // Add save button handlers
                container.querySelectorAll('.save-episode').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const episodeId = btn.closest('.episode-item').dataset.episodeId;
                        const isSaved = btn.classList.contains('saved');
                        
                        if (isSaved) {
                            await this.removeFromSaved(episodeId);
                            btn.classList.remove('saved');
                            btn.innerHTML = '<i class="ri-bookmark-line"></i>';
                        } else {
                            await this.saveForLater(episodeId);
                            btn.classList.add('saved');
                            btn.innerHTML = '<i class="ri-bookmark-fill"></i>';
                        }
                    });
                });

                // Add click handlers for descriptions
                container.querySelectorAll('.show-description').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const desc = btn.nextElementSibling;
                        const isExpanded = desc.classList.toggle('expanded');
                        btn.innerHTML = isExpanded ? 
                            'Hide Description <i class="ri-arrow-up-s-line"></i>' : 
                            'Show Description <i class="ri-arrow-down-s-line"></i>';
                    });
                });

                // Add click handlers for playing episodes
                container.querySelectorAll('.episode-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const episodeId = item.dataset.episodeId;
                        const episode = episodes.find(e => e.id === episodeId);
                        
                        const playEvent = new CustomEvent('xm-play-track', {
                            detail: {
                                id: episode.id,
                                title: episode.title,
                                artist: podcast.title,
                                audioUrl: episode.audio_url,
                                coverUrl: podcast.image_url,
                                type: 'podcast'
                            }
                        });
                        document.dispatchEvent(playEvent);
                    });
                });
            }
        } catch (error) {
            console.error('Failed to load podcast:', error);
            alert('Podcast not found');
            window.location.href = getPagePath('/discover');
        }
    }

    async saveForLater(episodeId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('saved_episodes')
                .insert([{ user_id: session.user.id, episode_id: episodeId }]);

            if (error) throw error;
            notifications.show('Episode saved for later', 'success');
        } catch (error) {
            console.error('Failed to save episode:', error);
            notifications.show('Failed to save episode', 'error');
        }
    }

    async removeFromSaved(episodeId) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('saved_episodes')
                .delete()
                .eq('user_id', session.user.id)
                .eq('episode_id', episodeId);

            if (error) throw error;
            notifications.show('Episode removed from saved', 'success');
        } catch (error) {
            console.error('Failed to remove episode:', error);
            notifications.show('Failed to remove episode', 'error');
        }
    }

    addFollowButton(podcastId, isFollowed) {
        const buttonContainer = document.querySelector('.podcast-actions') || this.createButtonContainer();
        
        buttonContainer.innerHTML = `
            <button class="follow-btn ${isFollowed ? 'following' : ''}" data-podcast-id="${podcastId}">
                <i class="ri-${isFollowed ? 'check-line' : 'add-line'}"></i>
                ${isFollowed ? 'Following' : 'Follow'}
            </button>
        `;

        buttonContainer.querySelector('.follow-btn').addEventListener('click', async (e) => {
            const button = e.target.closest('.follow-btn');
            const isNowFollowing = !button.classList.contains('following');

            if (isNowFollowing) {
                await FollowService.followPodcast(podcastId);
            } else {
                await FollowService.unfollowPodcast(podcastId);
            }

            button.classList.toggle('following');
            button.innerHTML = `
                <i class="ri-${isNowFollowing ? 'check-line' : 'add-line'}"></i>
                ${isNowFollowing ? 'Following' : 'Follow'}
            `;
        });
    }

    createButtonContainer() {
        const container = document.createElement('div');
        container.className = 'podcast-actions';
        document.querySelector('.podcast-info').appendChild(container);
        return container;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PodcastPage();
});
