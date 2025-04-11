import { supabase } from './supabase.js';
import { notifications } from './services/notifications.js';
import { QueueService } from './services/queue.js';
import { getLyrics } from './services/genius.js';
import { PlayerStateManager } from './services/playerState.js';
import { AdManager } from './services/adManager.js';

export class Player {
    constructor() {
        this.audioElement = new Audio();
        this.currentTrack = null;
        this.loading = false;
        this.isDragging = false;
        this.lastVolume = 1;
        this.autoQueueEnabled = false;
        this.isShuffled = false;
        this.queue = [];
        this.originalQueue = [];
        this.contextMenu = document.querySelector('.context-menu');
        this.contextTarget = null;
        this.setupContextMenu();
        this.adManager = new AdManager();
        this.pendingTrack = null; // Track to play after ads
        this.pendingStartTime = 0; // Start time for pending track
        this.DEFAULT_COVER = 'https://d2zcpib8duehag.cloudfront.net/xmdiscover-default-cover.png';
        this.wakeLock = null;
        this.setupVisibilityHandling();

        // Initialize player elements
        this.elements = {
            progress: document.querySelector('.xm-progress'),
            progressBar: document.querySelector('.xm-progress-bar'),
            progressFill: document.querySelector('.xm-progress-fill'),
            progressHandle: document.querySelector('.xm-progress-handle'),
            timeCurrent: document.querySelector('.xm-time.current'),
            timeTotal: document.querySelector('.xm-time.total'),
            volumeBar: document.querySelector('.xm-volume-bar'),
            volumeFill: document.querySelector('.xm-volume-fill'),
            volumeBtn: document.querySelector('.xm-volume .xm-btn'),
            volumeIcon: document.querySelector('.xm-volume .xm-btn i'),
            playButtons: document.querySelectorAll('.xm-btn.play'),
            prevButton: document.querySelector('[aria-label="Previous"]'),
            nextButton: document.querySelector('[aria-label="Next"]'),
            repeatButton: document.querySelector('[aria-label="Repeat"]'),
            shuffleButton: document.querySelector('[aria-label="Shuffle"]'),
            smartQueueButton: document.querySelector('[aria-label="Smart Queue"]'),
            likeButton: document.querySelector('.xm-btn.like'),
            fullscreenPlayer: document.querySelector('.xm-fullscreen'),
            fullscreenCover: document.querySelector('.xm-fullscreen-cover'),
            fullscreenTitle: document.querySelector('.xm-fullscreen .xm-title'),
            fullscreenArtist: document.querySelector('.xm-fullscreen .xm-artist'),
            closeFullscreenBtn: document.querySelector('.xm-fullscreen .xm-btn.close'),
            sidebar: document.querySelector('.xm-sidebar'),
            sidebarClose: document.querySelector('.xm-sidebar .xm-btn.close'),
            sidebarTitle: document.querySelector('.xm-sidebar-header h3'),
            queuePanel: document.querySelector('.xm-panel.queue'),
            lyricsPanel: document.querySelector('.xm-panel.lyrics'),
            panelTriggers: document.querySelectorAll('[data-panel]'),
            cover: document.querySelector('.xm-cover'),
            tabs: document.querySelectorAll('.xm-tab'),
            tabPanels: document.querySelectorAll('.xm-tab-panel'),
            queueList: document.querySelector('.xm-queue-list'),
            lyricsContent: document.querySelector('.xm-lyrics-content')
        };

        // Initialize from service worker state if available
        if (window.INITIAL_PLAYER_STATE) {
            this.restoreState(window.INITIAL_PLAYER_STATE);
        }

        // Listen for state updates from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'PLAYER_STATE_UPDATE') {
                this.syncState(event.data.state);
            }
        });

        // Request initial state
        this.requestStateFromServiceWorker();

        // Add event listener for play track events
        document.addEventListener('xm-play-track', async (e) => {
            await this.playTrack(e.detail);
        });

        // Add click handler for cover art to open fullscreen
        this.elements.cover?.addEventListener('click', () => this.toggleFullscreen());

        this.setupEventListeners();

        PlayerStateManager.init();
        this.setupMediaSession();
        this.handleVisibilityChange();

        // Check DRM and adblock status on init
        this.checkProtectedContent();
        this.setupAdblockDetection();
    }

    async checkProtectedContent() {
        if (window.isSecureContext && navigator.requestMediaKeySystemAccess) {
            try {
                await navigator.requestMediaKeySystemAccess('org.w3.clearkey', [{
                    initDataTypes: ['keyids'],
                    audioCapabilities: [
                        { contentType: 'audio/mp4; codecs="mp4a.40.2"' }
                    ]
                }]);
            } catch (error) {
                notifications.show('Please enable protected content playback in your browser settings to ensure uninterrupted listening.', 'warning', 8000);
            }
        }
    }

    setupAdblockDetection() {
        // Monitor ad service availability
        const testAd = document.createElement('div');
        testAd.innerHTML = '&nbsp;';
        testAd.className = 'adsbox';
        document.body.appendChild(testAd);

        window.setTimeout(() => {
            if (testAd.offsetHeight === 0) {
                notifications.show('Please disable your ad blocker to support our service and artists.', 'warning', 0);
                this.adblockDetected = true;
            }
            testAd.remove();
        }, 100);
    }

    setupEventListeners() {
        // Progress bar
        this.elements.progressBar?.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.updateProgress(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) this.updateProgress(e);
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Playback controls
        this.elements.playButtons.forEach(btn => {
            btn.addEventListener('click', () => this.togglePlay());
        });

        this.elements.prevButton?.addEventListener('click', () => this.prev());
        this.elements.nextButton?.addEventListener('click', () => this.next());
        this.elements.repeatButton?.addEventListener('click', () => this.toggleRepeat());
        this.elements.shuffleButton?.addEventListener('click', () => this.toggleShuffle());
        this.elements.smartQueueButton?.addEventListener('click', () => this.generateSmartQueue());

        // Audio element events
        this.audioElement.addEventListener('timeupdate', () => {
            this.handleTimeUpdate();
            // Update service worker state periodically (e.g., every 5 seconds)
            if (Math.floor(this.audioElement.currentTime) % 5 === 0) {
                this.updateServiceWorkerState();
            }
        });
        this.audioElement.addEventListener('loadedmetadata', () => this.handleMetadataLoaded());
        this.audioElement.addEventListener('ended', () => this.handleTrackEnded());

        // Volume control
        this.setupVolumeControl();

        // Mobile controls
        this.setupMobileControls();

        // Add fullscreen close button handler
        this.elements.closeFullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());

        // Add swipe down to close on mobile
        if (this.elements.fullscreenPlayer) {
            let touchStartY = 0;
            let touchMoveY = 0;

            this.elements.fullscreenPlayer.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            });

            this.elements.fullscreenPlayer.addEventListener('touchmove', (e) => {
                touchMoveY = e.touches[0].clientY;
                const deltaY = touchMoveY - touchStartY;

                if (deltaY > 0) { // Only allow downward swipe
                    this.elements.fullscreenPlayer.style.transform = `translateY(${deltaY}px)`;
                }
            });

            this.elements.fullscreenPlayer.addEventListener('touchend', () => {
                const deltaY = touchMoveY - touchStartY;
                
                if (deltaY > 100) { // Close if swiped down enough
                    this.toggleFullscreen();
                }
                
                this.elements.fullscreenPlayer.style.transform = '';
                touchStartY = 0;
                touchMoveY = 0;
            });
        }

        // Sidebar panel triggers
        this.elements.panelTriggers.forEach(trigger => {
            trigger.addEventListener('click', () => {
                const panelName = trigger.dataset.panel;
                this.openSidebar(panelName);
            });
        });

        // Sidebar close button
        this.elements.sidebarClose?.addEventListener('click', () => {
            this.closeSidebar();
        });

        // Add tab handling
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const panelName = tab.dataset.tab;
                this.switchTab(panelName);
            });
        });
    }

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
            navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                this.audioElement.currentTime = details.seekTime;
            });
        }
    }

    handleVisibilityChange() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && !this.audioElement.paused) {
                // Keep playing in background by requesting a wake lock
                try {
                    navigator.wakeLock?.request('screen');
                } catch (err) {
                    console.warn('Wake lock not supported');
                }
            }
        });
    }

    setupVisibilityHandling() {
        if ('wakeLock' in navigator) {
            document.addEventListener('visibilitychange', async () => {
                if (document.visibilityState === 'visible' && this.isPlaying) {
                    try {
                        this.wakeLock = await navigator.wakeLock.request('screen');
                    } catch (err) {
                        // Silently handle wake lock errors
                        console.log('Wake Lock error:', err.name, err.message);
                    }
                }
            });
        }
    }

    async requestWakeLock() {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                // Silently handle wake lock errors
                console.log('Wake Lock error:', err.name, err.message);
            }
        }
    }

    updateProgress(e) {
        const rect = this.elements.progressBar.getBoundingClientRect();
        const percent = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
        const time = this.audioElement.duration * percent;
        
        this.audioElement.currentTime = time;
        this.elements.progressFill.style.width = `${percent * 100}%`;
        this.elements.timeCurrent.textContent = this.formatTime(time);
    }

    handleTimeUpdate() {
        if (!this.isDragging && this.audioElement.duration) {
            const percent = (this.audioElement.currentTime / this.audioElement.duration) * 100;
            this.elements.progressFill.style.width = `${percent}%`;
            this.elements.timeCurrent.textContent = this.formatTime(this.audioElement.currentTime);
        }
    }

    handleMetadataLoaded() {
        this.elements.timeTotal.textContent = this.formatTime(this.audioElement.duration);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async playTrack(trackInfo, startTime = 0) {
        try {
            if (this.loading) {
                console.log('[Player] Already loading, skipping');
                return;
            }
            
            // Store track info before checking ads
            const standardTrack = PlayerStateManager.standardizeTrackInfo(trackInfo);
            console.log('[Player] Starting playback for:', standardTrack.title);
            
            // Handle podcast episodes differently
            if (standardTrack.type === 'podcast') {
                console.log('[Player] Handling podcast episode');
                const episodeData = await QueueService.fetchPodcastEpisode(standardTrack.id);
                if (episodeData?.audioUrl) {
                    standardTrack.audioUrl = episodeData.audioUrl;
                    standardTrack.coverUrl = episodeData.coverUrl || this.DEFAULT_COVER;
                }
            }
            // If no audio URL but we have track ID for regular tracks
            else if (!standardTrack.audioUrl && standardTrack.id) {
                console.log('[Player] No audio URL provided, fetching from database');
                const trackData = await QueueService.fetchTrackData(standardTrack.id);
                if (trackData?.audioUrl) {
                    standardTrack.audioUrl = trackData.audioUrl;
                    standardTrack.coverUrl = trackData.coverUrl || this.DEFAULT_COVER;
                }
            }
            
            // Final URL validation
            if (!standardTrack.audioUrl) {
                throw new Error('Track has no audio URL and could not be fetched');
            }

            // Ensure we have a valid cover URL
            standardTrack.coverUrl = standardTrack.coverUrl || this.DEFAULT_COVER;

            // Check if we need to play ads before track
            if (this.adManager.shouldPlayAdsBeforeTrack()) {
                const playedAds = await this.adManager.checkForAds('force');
                if (playedAds) {
                    console.log('[Player] Ads played, storing track as pending');
                    this.pendingTrack = standardTrack;
                    this.pendingStartTime = startTime;
                    return;
                }
            }

            // Continue with normal playback
            this.loading = true;
            document.body.classList.add('loading-track');

            console.log('[Player] Processing audio URL:', standardTrack.audioUrl);
            const audioUrl = await QueueService.getSignedUrl(standardTrack.audioUrl, standardTrack.type || 'song');
            
            if (!audioUrl) {
                throw new Error('Could not access audio file');
            }

            console.log('[Player] Starting audio playback with URL:', audioUrl);
            this.currentTrack = {
                ...standardTrack,
                audioUrl
            };

            try {
                this.audioElement.src = audioUrl;
                this.audioElement.currentTime = startTime;
                await this.audioElement.play();
                this.updatePlayerUI();

                // Update media session metadata with validation
                if ('mediaSession' in navigator) {
                    try {
                        const metadata = {
                            title: standardTrack.title || 'Unknown Title',
                            artist: standardTrack.artist || 'Unknown Artist',
                            artwork: []
                        };

                        // Only add artwork if we have a valid URL
                        if (standardTrack.coverUrl) {
                            metadata.artwork = [
                                { src: standardTrack.coverUrl, sizes: '512x512', type: 'image/jpeg' }
                            ];
                        }

                        navigator.mediaSession.metadata = new MediaMetadata(metadata);
                    } catch (metadataError) {
                        console.warn('[Player] MediaMetadata error:', metadataError);
                        // Don't throw - continue playback even if metadata fails
                    }
                }

                PlayerStateManager.updateState(this.currentTrack, this.queue);
                console.log('[Player] Playback started successfully');

            } catch (err) {
                console.error('[Player] Playback error:', err);
                throw new Error('Could not play audio file');
            }

            this.updateQueueUI();

        } catch (error) {
            console.error('[Player] Error:', error);
            this.handlePlaybackError(error);
        } finally {
            this.loading = false;
            document.body.classList.remove('loading-track');
        }
    }

    handlePlaybackError(error) {
        // Only show error if we have a current track
        if (this.currentTrack) {
            this.clearPlayer();
            const message = error.message === 'Could not access audio file'
                ? 'This track is currently unavailable.'
                : 'Unable to play this track. Please try again later.';
            notifications.show(message, 'error');
        }
    }

    clearPlayer() {
        this.audioElement.removeAttribute('src');
        this.audioElement.load();
        this.currentTrack = null;

        // Reset UI elements
        this.elements.progressFill.style.width = '0%';
        this.elements.timeCurrent.textContent = '0:00';
        this.elements.timeTotal.textContent = '0:00';
        this.updatePlayerUI();
        this.adManager.reset();
    }

    updatePlayerUI() {
        if (!this.currentTrack) {
            document.querySelector('.xm-title').textContent = 'Select a track';
            document.querySelector('.xm-artist').textContent = '-';
            document.querySelector('.xm-cover').style.backgroundImage = '';
            return;
        }

        const cover = document.querySelector('.xm-cover');
        const title = document.querySelector('.xm-title');
        const artist = document.querySelector('.xm-artist');

        if (cover) cover.style.backgroundImage = `url('${this.currentTrack.coverUrl}')`;
        if (title) title.textContent = this.currentTrack.title;
        if (artist) artist.textContent = this.currentTrack.artist;

        this.updatePlayButtons();

        // Also update fullscreen if active
        if (this.elements.fullscreenPlayer?.classList.contains('active')) {
            this.updateFullscreenUI();
        }

        // Disable controls during ads
        const isAdBreak = this.adManager.adBreakInProgress;
        this.elements.nextButton.disabled = isAdBreak;
        this.elements.prevButton.disabled = isAdBreak;
        this.elements.repeatButton.disabled = isAdBreak;
        this.elements.shuffleButton.disabled = isAdBreak;
        this.elements.smartQueueButton.disabled = isAdBreak;

        [this.elements.nextButton, this.elements.prevButton, 
         this.elements.repeatButton, this.elements.shuffleButton,
         this.elements.smartQueueButton].forEach(btn => {
            if (btn) btn.style.opacity = isAdBreak ? '0.5' : '1';
        });

        // Show bookmark instead of heart for podcasts
        const likeBtn = document.querySelector('.xm-btn.like');
        if (likeBtn) {
            if (this.currentTrack?.type === 'podcast') {
                likeBtn.innerHTML = '<i class="ri-bookmark-line"></i>';
                likeBtn.setAttribute('aria-label', 'Save for Later');
                // Handle podcast save action
                likeBtn.onclick = () => this.savePodcastEpisode();
            } else {
                // Update like button status
                this.updateLikeButtonStatus(likeBtn);
                likeBtn.setAttribute('aria-label', 'Like');
                // Restore original like functionality
                likeBtn.onclick = () => this.likeTrack();
            }
        }
    }

    async updateLikeButtonStatus(likeBtn) {
        if (!this.currentTrack?.id) return;
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data } = await supabase
                .from('likes')
                .select('id')
                .eq('user_id', session.user.id)
                .eq('song_id', this.currentTrack.id)
                .single();

            const icon = likeBtn.querySelector('i');
            icon.className = data ? 'ri-heart-3-fill' : 'ri-heart-3-line';
        } catch (error) {
            console.error('Failed to check like status:', error);
        }
    }

    async savePodcastEpisode() {
        if (!this.currentTrack?.id) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            notifications.show('Please log in to save episodes', 'error');
            return;
        }

        const likeBtn = document.querySelector('.xm-btn.like');
        const isSaved = likeBtn.querySelector('i').classList.contains('ri-bookmark-fill');

        try {
            if (isSaved) {
                await supabase
                    .from('saved_episodes')
                    .delete()
                    .eq('user_id', session.user.id)
                    .eq('episode_id', this.currentTrack.id);
                    
                likeBtn.innerHTML = '<i class="ri-bookmark-line"></i>';
                notifications.show('Episode removed from saved', 'success');
            } else {
                await supabase
                    .from('saved_episodes')
                    .insert([{ 
                        user_id: session.user.id, 
                        episode_id: this.currentTrack.id 
                    }]);
                    
                likeBtn.innerHTML = '<i class="ri-bookmark-fill"></i>';
                notifications.show('Episode saved for later', 'success');
            }
        } catch (error) {
            console.error('Failed to save/remove episode:', error);
            notifications.show('Failed to update saved episodes', 'error');
        }
    }

    async likeTrack() {
        if (!this.currentTrack?.id) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            notifications.show('Please log in to like tracks', 'error');
            return;
        }

        const likeBtn = document.querySelector('.xm-btn.like');
        const icon = likeBtn.querySelector('i');
        const isLiked = icon.classList.contains('ri-heart-3-fill');

        try {
            if (isLiked) {
                await supabase
                    .from('likes')
                    .delete()
                    .eq('user_id', session.user.id)
                    .eq('song_id', this.currentTrack.id);

                icon.className = 'ri-heart-3-line';
                notifications.show('Removed from your liked songs', 'info');
            } else {
                await supabase
                    .from('likes')
                    .insert([{
                        user_id: session.user.id,
                        song_id: this.currentTrack.id
                    }]);

                icon.className = 'ri-heart-3-fill';
                notifications.show('Added to your liked songs', 'success');
            }
        } catch (error) {
            console.error('Failed to update like:', error);
            notifications.show('Failed to update like status', 'error');
        }
    }

    togglePlay() {
        if (this.audioElement.paused) {
            this.audioElement.play();
        } else {
            this.audioElement.pause();
        }
        this.updatePlayButtons();
    }

    updatePlayButtons() {
        this.elements.playButtons.forEach(btn => {
            const icon = btn.querySelector('i');
            icon.className = this.audioElement.paused ? 'ri-play-fill' : 'ri-pause-fill';
        });
    }

    async next() {
        if (this.adManager.adBreakInProgress) return;
        if (this.queue.length > 0) {
            const nextTrack = this.queue.shift();
            // Store track info before checking ads
            const playedAds = await this.adManager.checkForAds('skip');
            
            if (playedAds) {
                this.pendingTrack = nextTrack;
                this.pendingStartTime = 0;
                this.updateQueueUI();
                return;
            }
            
            await this.playTrack(nextTrack);
            this.updateQueueUI();
        }
    }

    prev() {
        if (this.adManager.adBreakInProgress) return;
        // Implement previous track logic
        if (this.audioElement.currentTime > 3) {
            this.audioElement.currentTime = 0;
        } else {
            // Play previous track in queue
        }
    }

    toggleRepeat() {
        this.audioElement.loop = !this.audioElement.loop;
        this.elements.repeatButton.classList.toggle('active');
    }

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        this.elements.shuffleButton.classList.toggle('active');

        if (this.isShuffled && this.queue.length > 0) {
            // Store original queue if not stored
            if (this.originalQueue.length === 0) {
                this.originalQueue = [...this.queue];
            }
            // Shuffle current queue
            this.queue = this.shuffleArray([...this.queue]);
        } else if (!this.isShuffled && this.originalQueue.length > 0) {
            // Restore original queue order
            this.queue = [...this.originalQueue];
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    async generateSmartQueue() {
        if (!this.currentTrack) {
            notifications.show('No track currently playing', 'error');
            return;
        }
        
        this.elements.smartQueueButton.classList.add('active');
        try {
            const smartQueue = await QueueService.generateSmartQueue(this.currentTrack);
            if (!smartQueue?.length) {
                throw new Error('No similar tracks found');
            }
            
            // Replace current queue with smart queue
            this.queue = smartQueue;
            if (this.isShuffled) {
                this.queue = this.shuffleArray([...this.queue]);
            }
            this.originalQueue = [...smartQueue];
            
            // Update UI and notify user
            this.updateQueueUI();
            notifications.show('Smart Queue generated!', 'success');
        } catch (error) {
            console.error('Smart queue failed:', error);
            notifications.show(error.message || 'Could not generate Smart Queue', 'error');
        } finally {
            this.elements.smartQueueButton.classList.remove('active');
        }
    }

    addToQueue(track) {
        if (!track?.audioUrl) {
            console.error('Invalid track data:', track);
            notifications.show('Cannot add invalid track to queue', 'error');
            return;
        }

        this.queue.push(track);
        if (!this.isShuffled) {
            this.originalQueue.push(track);
        }
        this.updateQueueUI();
        notifications.show('Added to queue', 'success');
    }

    clearQueue() {
        this.queue = [];
        this.originalQueue = [];
        this.updateQueueUI();
    }

    setupVolumeControl() {
        if (!this.elements.volumeBar) return;

        this.elements.volumeBar.addEventListener('click', (e) => {
            const rect = this.elements.volumeBar.getBoundingClientRect();
            const volume = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
            this.setVolume(volume);
        });

        this.elements.volumeBtn.addEventListener('click', () => {
            if (this.audioElement.volume > 0) {
                this.lastVolume = this.audioElement.volume;
                this.setVolume(0);
            } else {
                this.setVolume(this.lastVolume || 1);
            }
        });
    }

    setVolume(volume) {
        this.audioElement.volume = volume;
        this.elements.volumeFill.style.width = `${volume * 100}%`;
        this.updateVolumeIcon(volume);
        this.updateServiceWorkerState();
    }

    updateVolumeIcon(volume) {
        const icon = this.elements.volumeIcon;
        if (volume === 0) {
            icon.className = 'ri-volume-mute-line';
        } else if (volume < 0.5) {
            icon.className = 'ri-volume-down-line';
        } else {
            icon.className = 'ri-volume-up-line';
        }
    }

    setupMobileControls() {
        const touchStartY = 0;
        const sidebar = document.querySelector('.fullscreen-sidebar');
        const closeBtn = document.querySelector('.mobile-close');

        if (closeBtn && sidebar) {
            closeBtn.addEventListener('click', () => this.closeSidebar(sidebar));
        }

        if (sidebar) {
            sidebar.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                touchStartY = touch.clientY;
            });

            sidebar.addEventListener('touchmove', (e) => {
                const deltaY = e.touches[0].clientY - touchStartY;
                if (deltaY > 0) {
                    sidebar.style.transform = `translateY(${deltaY}px)`;
                }
            });

            sidebar.addEventListener('touchend', (e) => {
                const deltaY = e.changedTouches[0].clientY - touchStartY;
                if (deltaY > 100) {
                    this.closeSidebar(sidebar);
                } else {
                    sidebar.style.transform = '';
                }
            });
        }
    }

    closeSidebar(sidebar) {
        if (!sidebar) return;
        
        sidebar.style.transform = 'translateY(100%)';
        sidebar.classList.remove('active');
        
        setTimeout(() => {
            sidebar.style.display = 'none';
            sidebar.style.transform = '';
        }, 300);
    }

    async handleTrackEnded() {
        if (this.audioElement.loop) {
            this.audioElement.play();
            return;
        }

        // If we have a pending track from ads, play it first
        if (this.pendingTrack) {
            const track = this.pendingTrack;
            const startTime = this.pendingStartTime;
            this.pendingTrack = null;
            this.pendingStartTime = 0;
            await this.playTrack(track, startTime);
            return;
        }

        // Normal queue handling - try next track
        if (this.queue.length > 0) {
            const nextTrack = this.queue[0]; // Don't shift yet
            const playedAds = await this.adManager.checkForAds('interval');

            if (playedAds) {
                // Store next track as pending but don't remove from queue yet
                this.pendingTrack = nextTrack;
                this.pendingStartTime = 0;
                return;
            }

            // No ads played, proceed with next track
            this.queue.shift();
            await this.playTrack(nextTrack);
            this.updateQueueUI();
        }
    }

    toggleFullscreen() {
        if (!this.elements.fullscreenPlayer) return;
        
        const isActive = this.elements.fullscreenPlayer.classList.contains('active');
        
        if (isActive) {
            this.elements.fullscreenPlayer.classList.remove('active');
            document.body.style.overflow = '';
        } else {
            // Close sidebar if open
            this.closeSidebar();
            
            this.elements.fullscreenPlayer.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.updateFullscreenUI();
        }
    }

    updateFullscreenUI() {
        if (!this.currentTrack) return;

        this.elements.fullscreenCover.style.backgroundImage = `url('${this.currentTrack.coverUrl}')`;
        this.elements.fullscreenTitle.textContent = this.currentTrack.title;
        this.elements.fullscreenArtist.textContent = this.currentTrack.artist;

        // Also update queue/lyrics if those panels are active
        const activePanel = document.querySelector('.xm-tab-panel.active');
        if (activePanel.classList.contains('queue')) {
            this.updateQueueUI();
        } else if (activePanel.classList.contains('lyrics')) {
            this.updateLyricsUI();
        }
    }

    openSidebar(panelName) {
        if (!this.elements.sidebar) return;

        // Reset all panels
        document.querySelectorAll('.xm-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        // Activate selected panel
        const panel = document.querySelector(`.xm-panel.${panelName}`);
        if (panel) {
            panel.classList.add('active');
            this.elements.sidebarTitle.textContent = panelName === 'queue' ? 'Queue' : 'Lyrics';
        }

        // Show sidebar
        this.elements.sidebar.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeSidebar() {
        if (!this.elements.sidebar) return;
        
        this.elements.sidebar.classList.remove('active');
        document.body.style.overflow = '';
        
        // Reset panels
        document.querySelectorAll('.xm-panel').forEach(panel => {
            panel.classList.remove('active');
        });
    }

    switchTab(panelName) {
        this.elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === panelName);
        });

        this.elements.tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.classList.contains(panelName));
        });

        if (panelName === 'queue') {
            this.updateQueueUI();
        } else if (panelName === 'lyrics') {
            this.updateLyricsUI();
        }
    }

    updateQueueUI() {
        if (!this.elements.queueList) return;

        // Disable queue interaction during ads
        const isAdBreak = this.adManager.adBreakInProgress;
        this.elements.queueList.style.pointerEvents = isAdBreak ? 'none' : 'auto';
        this.elements.queueList.style.opacity = isAdBreak ? '0.5' : '1';

        const queueHtml = this.queue.map((track, index) => `
            <div class="xm-queue-item${track.id === this.currentTrack?.id ? ' active' : ''}" data-index="${index}">
                <div class="xm-queue-cover" style="background-image: url('${track.coverUrl}')"></div>
                <div class="xm-queue-info">
                    <h4 class="xm-title">${track.title}</h4>
                    <p class="xm-artist">${track.artist}</p>
                </div>
                <button class="xm-remove-queue" data-index="${index}">×</button>
            </div>
        `).join('');

        this.elements.queueList.innerHTML = queueHtml || '<div class="xm-queue-empty">No tracks in queue</div>';

        // Add click handlers
        this.elements.queueList.querySelectorAll('.xm-queue-item').forEach(item => {
            // Play track on click
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('xm-remove-queue')) return;
                const index = parseInt(item.dataset.index);
                if (index >= 0 && index < this.queue.length) {
                    this.playTrack(this.queue[index]);
                }
            });

            // Remove track button
            item.querySelector('.xm-remove-queue')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(item.dataset.index);
                if (index >= 0 && index < this.queue.length) {
                    this.queue.splice(index, 1);
                    this.updateQueueUI();
                }
            });
        });
    }

    addToQueue(track) {
        if (!track?.audioUrl) {
            console.error('Invalid track data:', track);
            notifications.show('Cannot add invalid track to queue', 'error');
            return;
        }

        this.queue.push(track);
        if (!this.isShuffled) {
            this.originalQueue.push(track);
        }
        this.updateQueueUI();
        notifications.show('Added to queue', 'success');
    }

    async updateLyricsUI() {
        if (!this.elements.lyricsContent || !this.currentTrack) return;

        this.elements.lyricsContent.innerHTML = '<p>Loading lyrics...</p>';
        
        try {
            const lyrics = await getLyrics(this.currentTrack.title, this.currentTrack.artist);
            if (lyrics) {
                this.elements.lyricsContent.innerHTML = lyrics
                    .split('\n')
                    .map(line => `<p>${line || '&nbsp;'}</p>`)
                    .join('');
            } else {
                this.elements.lyricsContent.innerHTML = '<p class="no-lyrics">No lyrics found</p>';
            }
        } catch (error) {
            console.error('Failed to update lyrics:', error);
            this.elements.lyricsContent.innerHTML = '<p class="lyrics-error">Unable to load lyrics</p>';
        }
    }

    setupContextMenu() {
        // Add context menu event listeners
        document.addEventListener('contextmenu', (e) => {
            // Check if target is a playable item
            const target = e.target.closest('[data-track-id], [data-album-id], [data-episode-id]');
            if (!target) return;

            e.preventDefault();
            this.showContextMenu(e.pageX, e.pageY, target);
        });

        // Handle context menu item clicks
        this.contextMenu?.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action || !this.contextTarget) return;

            switch(action) {
                case 'play-next':
                    this.addToQueueNext(this.contextTarget);
                    break;
                case 'add-queue':
                    this.addToQueue(this.contextTarget);
                    break;
            }
            this.hideContextMenu();
        });

        // Hide context menu on click outside
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('scroll', () => this.hideContextMenu());
        
        // Prevent menu from going off-screen
        window.addEventListener('resize', () => this.hideContextMenu());
    }

    showContextMenu(x, y, target) {
        if (!this.contextMenu) return;
        
        this.contextTarget = target;
        this.contextMenu.classList.add('active');

        // Adjust menu position if it would go off screen
        const rect = this.contextMenu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        const adjustedX = x + rect.width > windowWidth ? windowWidth - rect.width : x;
        const adjustedY = y + rect.height > windowHeight ? windowHeight - rect.height : y;

        this.contextMenu.style.left = adjustedX + 'px';
        this.contextMenu.style.top = adjustedY + 'px';
    }

    hideContextMenu() {
        if (!this.contextMenu) return;
        this.contextMenu.classList.remove('active');
        this.contextTarget = null;
    }

    addToQueueNext(target) {
        if (!target) return;
        
        // Extract track info based on target type
        let trackInfo = this.getTrackInfoFromElement(target);
        if (!trackInfo) return;

        // Add to beginning of queue
        this.queue.unshift(trackInfo);
        this.updateQueueUI();
        notifications.show('Added to play next', 'success');
    }

    getTrackInfoFromElement(element) {
        // This method should be customized based on your HTML structure
        // Here's a basic example:
        if (element.dataset.trackId) {
            return {
                id: element.dataset.trackId,
                title: element.querySelector('.track-info h4')?.textContent || 'Unknown Title',
                artist: element.querySelector('.track-info p')?.textContent || 'Unknown Artist',
                audioUrl: element.dataset.audioUrl,
                coverUrl: element.querySelector('img')?.src || '',
                artistId: element.dataset.artistId
            };
        }
        // Add similar handling for albums and episodes if needed
        return null;
    }

    requestStateFromServiceWorker() {
        navigator.serviceWorker.controller?.postMessage({
            type: 'REQUEST_PLAYER_STATE'
        });
    }

    restoreState(state) {
        if (state.currentTrack) {
            this.currentTrack = state.currentTrack;
            this.queue = state.queue;
            this.updatePlayerUI();
            if (state.isPlaying) {
                this.playTrack(state.currentTrack, state.currentTime);
            }
            this.setVolume(state.volume);
        }
    }

    syncState(state) {
        // Only sync if we're not currently playing
        if (!this.currentTrack) {
            this.restoreState(state);
        }
    }

    updateServiceWorkerState() {
        navigator.serviceWorker.controller?.postMessage({
            type: 'UPDATE_PLAYER_STATE',
            state: {
                currentTrack: this.currentTrack,
                queue: this.queue,
                isPlaying: !this.audioElement.paused,
                currentTime: this.audioElement.currentTime,
                volume: this.audioElement.volume
            }
        });
    }
}
