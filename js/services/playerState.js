const playerChannel = new BroadcastChannel('player-state');

export const PlayerStateManager = {
    currentTrack: null,
    queue: [],
    
    init() {
        playerChannel.onmessage = (event) => {
            if (event.data.type === 'PLAYER_UPDATE') {
                this.currentTrack = event.data.currentTrack;
                this.queue = event.data.queue;
                document.dispatchEvent(new CustomEvent('player-state-update'));
            }
        };
    },

    updateState(currentTrack, queue) {
        this.currentTrack = currentTrack;
        this.queue = queue;
        playerChannel.postMessage({
            type: 'PLAYER_UPDATE',
            currentTrack,
            queue
        });
    },

    standardizeTrackInfo(track) {
        return {
            id: track.id,
            title: track.title,
            artist: track.artists?.name || track.artist || 'Unknown Artist',
            audioUrl: track.audio_url,
            coverUrl: track.cover_url,
            artistId: track.artists?.id || track.artist_id,
            duration: track.duration
        };
    }
};
