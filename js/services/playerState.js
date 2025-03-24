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
            audioUrl: track.audio_url || track.audioUrl,
            coverUrl: track.cover_url || track.coverUrl,
            artistId: track.artists?.id || track.artistId,
            type: track.type || 'song', // Add type to track info
            duration: track.duration
        };
    }
};
