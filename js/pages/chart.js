import { supabase } from '../supabase.js';
import { PlayerStateManager } from '../services/playerState.js';

export class ChartPage {
    constructor() {
        this.container = document.querySelector('.chart-tracks');
        this.updateTimer = null;
        this.loadTop100();
        this.setupUpdateCheck();
    }

    async loadTop100() {
        try {
            // Get current chart data
            const { data: chart } = await supabase
                .from('charts')
                .select(`
                    *,
                    chart_entries (
                        position,
                        previous_position,
                        streams,
                        songs (
                            id,
                            title,
                            cover_url,
                            artists (name)
                        )
                    )
                `)
                .eq('name', 'Top 100')
                .single();

            if (!chart) return;

            // Update chart info
            document.querySelector('.chart-title').textContent = chart.name;
            document.querySelector('.chart-dates').textContent = `${new Date(chart.start_date).toLocaleDateString()} - ${new Date(chart.end_date).toLocaleDateString()}`;

            // Update next update countdown
            this.updateNextUpdateTime(new Date(chart.end_date));

            // Render tracks
            if (this.container && chart.chart_entries) {
                this.container.innerHTML = chart.chart_entries
                    .sort((a, b) => a.position - b.position)
                    .map(entry => {
                        const positionChange = entry.previous_position ? 
                            entry.previous_position - entry.position : 
                            'new';
                        
                        const changeIndicator = positionChange === 'new' ? 'NEW' :
                            positionChange === 0 ? '=' :
                            positionChange > 0 ? `↑${positionChange}` :
                            `↓${Math.abs(positionChange)}`;

                        const changeClass = positionChange === 'new' ? 'new' :
                            positionChange > 0 ? 'up' :
                            positionChange < 0 ? 'down' : 'same';

                        return `
                            <div class="chart-track" data-track-id="${entry.songs.id}">
                                <div class="chart-position">
                                    <span class="position">${entry.position}</span>
                                    <span class="change ${changeClass}">${changeIndicator}</span>
                                </div>
                                <img src="${entry.songs.cover_url}" alt="${entry.songs.title}">
                                <div class="track-info">
                                    <h3>${entry.songs.title}</h3>
                                    <p>${entry.songs.artists.name}</p>
                                </div>
                                <div class="track-streams">
                                    <span class="streams">${entry.streams.toLocaleString()}</span>
                                    <span class="streams-label">plays</span>
                                </div>
                                <button class="play-btn" aria-label="Play">
                                    <i class="ri-play-fill"></i>
                                </button>
                            </div>
                        `;
                    }).join('');

                // Add play handlers
                this.container.querySelectorAll('.chart-track').forEach(track => {
                    track.addEventListener('click', () => this.playTrack(track.dataset.trackId));
                });
            }

        } catch (error) {
            console.error('Failed to load chart:', error);
        }
    }

    async playTrack(trackId) {
        try {
            const { data: track } = await supabase
                .from('songs')
                .select(`
                    *,
                    artists (name)
                `)
                .eq('id', trackId)
                .single();

            if (!track) return;

            const standardTrack = PlayerStateManager.standardizeTrackInfo(track);
            document.dispatchEvent(new CustomEvent('xm-play-track', {
                detail: standardTrack
            }));

        } catch (error) {
            console.error('Failed to play track:', error);
        }
    }

    updateNextUpdateTime(endDate) {
        const updateTimeEl = document.querySelector('.next-update');
        if (!updateTimeEl) return;

        clearInterval(this.updateTimer);
        this.updateTimer = setInterval(() => {
            const now = new Date();
            const diff = endDate - now;

            if (diff <= 0) {
                updateTimeEl.textContent = 'Updating soon...';
                clearInterval(this.updateTimer);
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

            updateTimeEl.textContent = `Next update in ${days}d ${hours}h ${minutes}m`;
        }, 60000);
    }

    setupUpdateCheck() {
        // Subscribe to chart updates
        const subscription = supabase
            .channel('chart-updates')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'chart_entries' },
                () => this.loadTop100()
            )
            .subscribe();

        // Cleanup on page unload
        window.addEventListener('unload', () => {
            subscription?.unsubscribe();
            clearInterval(this.updateTimer);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChartPage();
});
