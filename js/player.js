import { supabase } from './supabase-config.js';

class AudioPlayer {
    constructor() {
        this.audio = new Audio();
        this.currentSong = null;
        this.queue = [];
        this.initializePlayer();
    }

    initializePlayer() {
        const playerEl = document.getElementById('player');
        playerEl.innerHTML = `
            <div class="player-controls">
                <img id="song-cover" src="" alt="Album Cover">
                <div class="song-info">
                    <span id="song-title"></span>
                    <span id="song-artist"></span>
                </div>
                <div class="controls">
                    <button id="prev-btn">Previous</button>
                    <button id="play-btn">Play</button>
                    <button id="next-btn">Next</button>
                </div>
                <input type="range" id="progress" min="0" max="100" value="0">
            </div>
        `;

        this.attachEventListeners();
    }

    async playSong(songId) {
        try {
            const { data: song } = await supabase
                .from('songs')
                .select(`
                    *,
                    artists (name),
                    albums (title, cover_art_url)
                `)
                .eq('id', songId)
                .single();

            this.audio.src = song.stream_url;
            this.currentSong = song;
            this.updatePlayerUI();
            this.audio.play();
        } catch (error) {
            console.error('Error playing song:', error);
        }
    }

    attachEventListeners() {
        const playBtn = document.getElementById('play-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const progress = document.getElementById('progress');

        playBtn.addEventListener('click', () => {
            if (this.audio.paused) {
                this.audio.play();
                playBtn.textContent = 'Pause';
            } else {
                this.audio.pause();
                playBtn.textContent = 'Play';
            }
        });

        prevBtn.addEventListener('click', () => this.playPrevious());
        nextBtn.addEventListener('click', () => this.playNext());

        this.audio.addEventListener('timeupdate', () => {
            const percentage = (this.audio.currentTime / this.audio.duration) * 100;
            progress.value = percentage || 0;
        });

        progress.addEventListener('change', () => {
            const time = (progress.value / 100) * this.audio.duration;
            this.audio.currentTime = time;
        });
    }

    updatePlayerUI() {
        if (!this.currentSong) return;

        document.getElementById('song-cover').src = this.currentSong.albums.cover_art_url;
        document.getElementById('song-title').textContent = this.currentSong.title;
        document.getElementById('song-artist').textContent = this.currentSong.artists.name;
        document.getElementById('play-btn').textContent = this.audio.paused ? 'Play' : 'Pause';
    }

    playPrevious() {
        // Implement previous song logic
    }

    playNext() {
        // Implement next song logic
    }
}

export const player = new AudioPlayer();
