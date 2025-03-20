import { supabase, getPagePath } from './supabase.js';
import { searchSong, getLyrics } from './services/genius.js';
import { notifications } from './services/notifications.js';

// Helper function to normalize paths
function normalizePath(path) {
    // Remove leading slash and .html extension if present
    return path.replace(/^\//, '').replace(/\.html$/, '');
}

async function handleAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        // Get auth elements
        const loggedOutElements = document.querySelectorAll('[data-auth="logged-out"]');
        const loggedInElements = document.querySelectorAll('[data-auth="logged-in"]');
        
        if (session) {
            // Show logged in elements, hide logged out elements
            loggedOutElements.forEach(el => el.style.display = 'none');
            loggedInElements.forEach(el => el.style.display = 'flex');

            // Get user profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profile) {
                // Update profile elements
                const avatarImg = document.querySelector('.profile-avatar');
                const nameSpan = document.querySelector('.profile-name');
                
                if (avatarImg) {
                    avatarImg.src = profile.avatar_url || 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/default%20user.png';
                    avatarImg.onerror = () => {
                        avatarImg.src = 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/default%20user.png';
                    };
                }
                if (nameSpan) {
                    nameSpan.textContent = profile.display_name || profile.username;
                }
            }
        } else {
            // Show logged out elements, hide logged in elements
            loggedOutElements.forEach(el => el.style.display = 'flex');
            loggedInElements.forEach(el => el.style.display = 'none');
        }
    } catch (error) {
        console.error('Auth handling error:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load components sequentially to ensure correct order
        await loadComponent('header');
        await loadComponent('player');
        await loadComponent('footer');

        // Initialize auth handling
        await handleAuth();

        // Initialize player after components are loaded
        const player = initializePlayer();
        if (!player) {
            console.error('Player initialization failed');
            return;
        }

        // Set up profile menu handlers
        document.querySelector('.profile-trigger')?.addEventListener('click', (e) => {
            e.currentTarget.parentElement.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.profile-menu')) {
                document.querySelector('.profile-menu')?.classList.remove('active');
            }
        });

        // Set up mobile menu handlers with improved error handling
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
        const mobileMenu = document.querySelector('.mobile-menu');
        const mobileMenuClose = document.querySelector('.mobile-menu-close');

        if (!mobileMenuBtn || !mobileMenu || !mobileMenuClose) {
            console.error('Missing mobile menu elements');
            return;
        }

        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        mobileMenuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });

        // Close menu when clicking a link
        document.querySelectorAll('.mobile-nav a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (mobileMenu.classList.contains('active') && 
                !mobileMenu.contains(e.target) && 
                !mobileMenuBtn.contains(e.target)) {
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

    } catch (error) {
        console.error('Error loading components:', error);
    }
});

async function loadComponent(name) {
    try {
        const response = await fetch(`/components/${name}.html`);
        if (!response.ok) throw new Error(`Failed to load ${name} component`);
        const html = await response.text();
        const position = name === 'footer' ? 'beforeend' : 'afterbegin';
        document.body.insertAdjacentHTML(position, html);
        return true;
    } catch (error) {
        console.error(`Failed to load ${name} component:`, error);
        return false;
    }
}

async function checkLikeStatus(songId) {
    if (!songId) return false;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data: likes } = await supabase
        .from('likes')
        .select('id')
        .eq('song_id', songId)
        .eq('user_id', session.user.id)
        .single();
    
    return !!likes;
}

async function toggleLike(songId) {
    if (!songId) return false;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = getPagePath('/auth/login');
        return false;
    }

    const isLiked = await checkLikeStatus(songId);
    
    try {
        if (isLiked) {
            await supabase
                .from('likes')
                .delete()
                .eq('song_id', songId)
                .eq('user_id', session.user.id);
            notifications.show('Removed from your liked songs', 'info');
        } else {
            await supabase
                .from('likes')
                .insert([{ song_id: songId, user_id: session.user.id }]);
            notifications.show('Added to your liked songs', 'success');
        }
        return !isLiked;
    } catch (error) {
        notifications.show('Failed to update like status', 'error');
        return isLiked;
    }
}

function initializePlayer() {
    // Wait for elements to be available
    const elements = {
        progressBar: document.querySelector('.progress-bar'),
        progressCurrent: document.querySelector('.progress-current'),
        timeDisplay: document.querySelector('.time-current'),
        timeTotalDisplay: document.querySelector('.time-total'),
        volumeBar: document.querySelector('.volume-bar'),
        volumeCurrent: document.querySelector('.volume-current'),
        volumeButton: document.querySelector('.volume')
    };

    // Validate required elements
    const missingElements = Object.entries(elements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);

    if (missingElements.length > 0) {
        console.error('Missing required player elements:', missingElements);
        return null;
    }

    const player = {
        audioElement: new Audio(),
        currentTrack: null,
        loading: false,
        ...elements,
        isDraggingProgress: false,
        isDraggingVolume: false,
        lastVolume: 1,

        streamingTimer: {
            startTime: null,
            totalTime: 30 * 60, // 30 minutes in seconds
            timeLeft: 30 * 60,
            adBreakActive: false,
            lastCheckpoint: null,

            start() {
                if (!this.startTime) {
                    this.startTime = Date.now();
                    this.lastCheckpoint = Date.now();
                }
            },

            update() {
                if (!this.startTime || this.adBreakActive) return;
                const now = Date.now();
                const elapsed = (now - this.lastCheckpoint) / 1000;
                this.timeLeft -= elapsed;
                this.lastCheckpoint = now;

                if (this.timeLeft <= 0) {
                    this.triggerAdBreak();
                }
            },

            triggerAdBreak() {
                this.adBreakActive = true;
                this.timeLeft = this.totalTime;
                
                // Pause current playback
                player.audioElement.pause();
                
                // This will be implemented in the ad system
                import('/js/services/ads.js').then(({ AdService }) => {
                    AdService.playAdBreak().then(() => {
                        this.adBreakActive = false;
                        this.startTime = Date.now();
                        this.lastCheckpoint = Date.now();
                        player.audioElement.play();
                    });
                }).catch(err => {
                    console.error('Failed to load ad service:', err);
                    // Fallback: reset timer and continue playback
                    this.adBreakActive = false;
                    this.startTime = Date.now();
                    this.lastCheckpoint = Date.now();
                    player.audioElement.play();
                });
            },

            reset() {
                this.startTime = null;
                this.timeLeft = this.totalTime;
                this.adBreakActive = false;
            }
        },

        async loadLyrics(trackInfo) {
            const lyricsPanel = document.querySelector('.lyrics-panel .lyrics-content');
            lyricsPanel.innerHTML = '<p>Loading lyrics...</p>';
            
            try {
                const geniusUrl = await searchSong(trackInfo.title, trackInfo.artist);
                if (!geniusUrl) {
                    throw new Error('No lyrics found');
                }
                
                const lyrics = await getLyrics(geniusUrl);
                if (!lyrics) {
                    throw new Error('Could not extract lyrics');
                }
                
                lyricsPanel.innerHTML = `
                    <div class="lyrics-text">
                        ${lyrics.split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('')}
                    </div>
                    <div class="lyrics-source">
                        Lyrics provided by <a href="${geniusUrl}" target="_blank">Genius</a>
                    </div>
                `;
            } catch (error) {
                console.error('Failed to load lyrics:', error);
                lyricsPanel.innerHTML = '<p>No lyrics available</p>';
            }
        },

        async playTrack(trackInfo, autoplay = true) {
            try {
                if (this.loading) return;
                this.loading = true;

                // Validate input
                if (!trackInfo?.audioUrl) {
                    throw new Error('No audio URL provided');
                }

                // Get signed URL first before touching audio element
                const audioUrl = trackInfo.type === 'podcast' 
                    ? trackInfo.audioUrl 
                    : await this.getSignedUrl(trackInfo.audioUrl);

                if (!audioUrl) {
                    throw new Error('Could not access audio file');
                }

                // Update UI first
                this.updatePlayerUI(trackInfo);
                this.currentTrack = trackInfo;

                // Reset audio element and set new source
                this.audioElement.pause();
                this.audioElement.src = ''; // Clear source
                this.audioElement.load(); // Reset state
                
                this.audioElement.src = audioUrl;
                await new Promise((resolve, reject) => {
                    this.audioElement.onerror = (e) => {
                        const error = e.target.error;
                        if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                            reject(new Error('Audio format not supported'));
                        } else if (error?.code === MediaError.MEDIA_ERR_NETWORK) {
                            reject(new Error('Network error while loading audio'));
                        } else {
                            reject(new Error('Failed to load audio'));
                        }
                    };
                    this.audioElement.onloadedmetadata = () => resolve();
                    this.audioElement.load();
                });

                if (autoplay) {
                    try {
                        await this.audioElement.play();
                    } catch (playError) {
                        console.warn('Autoplay prevented:', playError);
                        // Don't throw here - just log warning
                    }
                }

                // Load lyrics for music tracks
                if (trackInfo.type !== 'podcast') {
                    this.loadLyrics(trackInfo).catch(console.error);
                }

                // Start streaming timer when playback begins
                this.streamingTimer.start();

            } catch (error) {
                console.error('Playback failed:', error);
                this.handlePlaybackError(error);
            } finally {
                this.loading = false;
            }
        },

        async togglePlayPause() {
            if (!this.currentTrack || !this.audioElement.src) return;

            try {
                const playIcon = document.querySelector('.play-pause i');
                if (this.audioElement.paused) {
                    await this.audioElement.play();
                    playIcon?.classList.replace('fa-play', 'fa-pause');
                } else {
                    this.audioElement.pause();
                    playIcon?.classList.replace('fa-pause', 'fa-play');
                }
                this.savePlayerState();
            } catch (error) {
                console.error('Playback toggle failed:', error);
            }
        },

        updatePlayerUI(trackInfo) {
            // Add loading state
            document.body.classList.add('loading-track');
            
            try {
                const coverEl = document.querySelector('.current-cover');
                const titleEl = document.querySelector('.current-title');
                const artistEl = document.querySelector('.current-artist');
                const typeEl = document.querySelector('.content-type');

                if (coverEl) coverEl.style.backgroundImage = `url('${trackInfo.coverUrl || ''}')`;
                if (titleEl) {
                    titleEl.innerHTML = `<span>${trackInfo.title || 'Unknown'}</span>`;
                    
                    // Check if text overflows
                    const span = titleEl.querySelector('span');
                    if (span && span.offsetWidth > titleEl.offsetWidth) {
                        titleEl.classList.add('scrolling');
                    } else {
                        titleEl.classList.remove('scrolling');
                    }
                }

                if (trackInfo.type === 'podcast') {
                    if (artistEl) artistEl.textContent = trackInfo.artist;
                    if (typeEl) typeEl.textContent = 'Podcast Episode';
                    document.querySelector('.lyrics')?.classList.add('hidden');
                } else {
                    if (artistEl) {
                        artistEl.innerHTML = `
                            <a href="${getPagePath('/pages/artist')}?id=${trackInfo.artistId}">${trackInfo.artist}</a>
                        `;
                    }
                    if (typeEl) typeEl.textContent = '';
                    document.querySelector('.lyrics')?.classList.remove('hidden');
                }

                const playIcon = document.querySelector('.play-pause i');
                playIcon?.classList.remove('fa-play');
                playIcon?.classList.add('fa-pause');

                // Update like button if it's a song
                const likeBtn = document.querySelector('.like-btn');
                if (likeBtn) {
                    if (trackInfo.type === 'podcast') {
                        likeBtn.style.display = 'none';
                    } else {
                        likeBtn.style.display = '';
                        likeBtn.dataset.songId = trackInfo.id || '';
                        
                        // Check like status
                        checkLikeStatus(trackInfo.id).then(isLiked => {
                            const icon = likeBtn.querySelector('i');
                            icon.className = isLiked ? 'ri-heart-3-fill' : 'ri-heart-3-line';
                            likeBtn.classList.toggle('active', isLiked);
                        });
                    }
                }
            } catch (error) {
                console.error('UI update failed:', error);
                notifications.show('Failed to update player', 'error');
            } finally {
                document.body.classList.remove('loading-track');
            }
        },

        clearPlayer() {
            // Remove source first to prevent error event
            this.audioElement.removeAttribute('src');
            this.audioElement.load();
            this.currentTrack = null;
            localStorage.removeItem('playerState');

            const coverEl = document.querySelector('.current-cover');
            const titleEl = document.querySelector('.current-title');
            const artistEl = document.querySelector('.current-artist');
            const playIcon = document.querySelector('.play-pause i');

            if (coverEl) coverEl.style.backgroundImage = '';
            if (titleEl) titleEl.textContent = 'Select a track';
            if (artistEl) artistEl.textContent = '-';
            if (playIcon) {
                playIcon.classList.remove('ri-pause-line');
                playIcon.classList.add('ri-play-line');
            }

            this.progressCurrent.style.width = '0%';
            this.timeDisplay.textContent = '0:00';
        },

        handlePlaybackError(error) {
            // Only show error if we have a current track
            if (this.currentTrack) {
                this.clearPlayer();
                const message = error.message === 'Could not access audio file'
                    ? 'This track is currently unavailable.'
                    : 'Unable to play this track. Please try again later.';
                notifications.show(message, 'error');
            }
        },

        async getSignedUrl(audioUrl) {
            if (!audioUrl) throw new Error('No audio URL provided');

            // Handle absolute URLs (podcasts)
            if (audioUrl.startsWith('http') && !audioUrl.includes('supabase.co')) {
                return audioUrl;
            }

            try {
                // Extract the file path from the URL or use the path directly
                let storagePath;
                
                if (audioUrl.includes('storage/v1/object')) {
                    // Handle full Supabase URLs
                    storagePath = audioUrl.split('storage/v1/object/sign/audio/')[1];
                    if (!storagePath) {
                        storagePath = audioUrl.split('storage/v1/object/public/audio/')[1];
                    }
                    // Remove any query parameters
                    storagePath = storagePath?.split('?')[0];
                } else {
                    // Handle direct paths
                    storagePath = audioUrl;
                }

                if (!storagePath) {
                    throw new Error('Invalid audio path');
                }

                // Create a new signed URL with 1-hour expiry
                const { data, error } = await supabase
                    .storage
                    .from('audio')
                    .createSignedUrl(decodeURIComponent(storagePath), 3600);

                if (error) throw error;
                if (!data?.signedUrl) throw new Error('Failed to get signed URL');

                return data.signedUrl;

            } catch (err) {
                console.error('Failed to get signed URL:', err);
                throw new Error('Could not access audio file');
            }
        },

        updateProgress() {
            if (!this.isDraggingProgress && this.audioElement.duration) {
                const percent = (this.audioElement.currentTime / this.audioElement.duration) * 100;
                this.progressCurrent.style.width = `${percent}%`;
                this.timeDisplay.textContent = this.formatTime(this.audioElement.currentTime);
            }
        },

        formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },

        setupProgressBar() {
            // Add touch events for mobile
            const handleTouchStart = (e) => {
                this.isDraggingProgress = true;
                this.updateProgressFromTouch(e.touches[0]);
            };

            const handleTouchMove = (e) => {
                if (this.isDraggingProgress) {
                    this.updateProgressFromTouch(e.touches[0]);
                }
            };

            const handleTouchEnd = () => {
                this.isDraggingProgress = false;
            };

            this.progressBar.addEventListener('touchstart', handleTouchStart);
            document.addEventListener('touchmove', handleTouchMove);
            document.addEventListener('touchend', handleTouchEnd);

            // Existing mouse events
            const handleMouseDown = (e) => {
                this.isDraggingProgress = true;
                this.updateProgressFromEvent(e);
            };

            const handleMouseMove = (e) => {
                if (this.isDraggingProgress) {
                    this.updateProgressFromEvent(e);
                }
            };

            const handleMouseUp = () => {
                this.isDraggingProgress = false;
            };

            // Add event listeners with bound functions
            this.progressBar.addEventListener('mousedown', handleMouseDown.bind(this));
            document.addEventListener('mousemove', handleMouseMove.bind(this));
            document.addEventListener('mouseup', handleMouseUp.bind(this));
            this.progressBar.addEventListener('click', this.updateProgressFromEvent.bind(this));
        },

        updateProgressFromTouch(touch) {
            if (!this.audioElement.duration) return;
            
            const rect = this.progressBar.getBoundingClientRect();
            const percent = Math.min(Math.max(0, (touch.clientX - rect.left) / rect.width), 1);
            this.audioElement.currentTime = this.audioElement.duration * percent;
            this.progressCurrent.style.width = `${percent * 100}%`;
        },

        updateProgressFromEvent(e) {
            if (!this.audioElement.duration) return;
            
            const rect = this.progressBar.getBoundingClientRect();
            const percent = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
            this.audioElement.currentTime = this.audioElement.duration * percent;
            this.progressCurrent.style.width = `${percent * 100}%`;
        },

        setupVolumeControl() {
            // Bind volume control handlers
            const handleMouseDown = (e) => {
                this.isDraggingVolume = true;
                this.updateVolumeFromEvent(e);
            };

            const handleMouseMove = (e) => {
                if (this.isDraggingVolume) {
                    this.updateVolumeFromEvent(e);
                }
            };

            const handleMouseUp = () => {
                this.isDraggingVolume = false;
            };

            this.volumeBar.addEventListener('mousedown', handleMouseDown.bind(this));
            document.addEventListener('mousemove', handleMouseMove.bind(this));
            document.addEventListener('mouseup', handleMouseUp.bind(this));
            this.volumeBar.addEventListener('click', this.updateVolumeFromEvent.bind(this));

            // Bind volume button handler
            this.volumeButton.addEventListener('click', () => {
                if (this.audioElement.volume > 0) {
                    this.lastVolume = this.audioElement.volume;
                    this.updateVolume(0);
                } else {
                    this.updateVolume(this.lastVolume);
                }
            });
        },

        updateVolumeFromEvent(e) {
            const rect = this.volumeBar.getBoundingClientRect();
            const volume = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
            this.updateVolume(volume);
        },

        updateVolume(volume) {
            this.audioElement.volume = volume;
            this.volumeCurrent.style.width = `${volume * 100}%`;
            this.updateVolumeIcon(volume);
        },

        updateVolumeIcon(volume) {
            const icon = this.volumeButton.querySelector('i');
            if (volume === 0) {
                icon.className = 'ri-volume-mute-line';
            } else if (volume < 0.5) {
                icon.className = 'ri-volume-down-line';
            } else {
                icon.className = 'ri-volume-up-line';
            }
        },

        savePlayerState() {
            if (this.currentTrack) {
                sessionStorage.setItem('playerState', JSON.stringify({
                    track: this.currentTrack,
                    currentTime: this.audioElement.currentTime,
                    volume: this.audioElement.volume,
                    isPlaying: !this.audioElement.paused
                }));
            }
        },

        async restorePlayerState() {
            const savedState = sessionStorage.getItem('playerState');
            if (savedState) {
                const state = JSON.parse(savedState);
                await this.playTrack(state.track, state.isPlaying);
                this.audioElement.currentTime = state.currentTime;
                this.updateVolume(state.volume || 1);

                // Update play/pause button icon
                const playIcon = document.querySelector('.play-pause i');
                if (playIcon) {
                    if (state.isPlaying) {
                        playIcon.classList.remove('fa-play');
                        playIcon.classList.add('fa-pause');
                    } else {
                        playIcon.classList.remove('fa-pause');
                        playIcon.classList.add('fa-play');
                    }
                }
            }
        },

        setupSidebar() {
            const sidebar = document.querySelector('.player-sidebar');
            const panels = document.querySelectorAll('.panel');
            let activePanel = null;
            const title = document.querySelector('.sidebar-title');

            // Handle panel button clicks
            document.querySelectorAll('[data-panel]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const panelName = btn.dataset.panel;
                    const panel = document.querySelector(`.${panelName}-panel`);
                    
                    // Toggle panel visibility
                    if (activePanel === panel) {
                        sidebar.classList.remove('active');
                        panel.classList.remove('active');
                        activePanel = null;
                    } else {
                        panels.forEach(p => p.classList.remove('active'));
                        panel.classList.add('active');
                        sidebar.classList.add('active');
                        activePanel = panel;
                        title.textContent = panelName.charAt(0).toUpperCase() + panelName.slice(1);
                    }
                });
            });

            // Close sidebar when clicking close button
            document.querySelector('.close-sidebar')?.addEventListener('click', () => {
                sidebar.classList.remove('active');
                panels.forEach(panel => panel.classList.remove('active'));
                activePanel = null;
            });

            // Close sidebar when clicking outside
            document.addEventListener('click', (e) => {
                if (!sidebar.contains(e.target) && !e.target.closest('[data-panel]')) {
                    sidebar.classList.remove('active');
                    panels.forEach(panel => panel.classList.remove('active'));
                    activePanel = null;
                }
            });

            // Add swipe down to close for mobile
            let touchStartY = 0;
            const fullscreenSidebar = document.querySelector('.fullscreen-sidebar');

            fullscreenSidebar?.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            });

            fullscreenSidebar?.addEventListener('touchmove', (e) => {
                const deltaY = e.touches[0].clientY - touchStartY;
                if (deltaY > 0) { // Only allow downward swipe
                    fullscreenSidebar.style.transform = `translateY(${deltaY}px)`;
                }
            });

            fullscreenSidebar?.addEventListener('touchend', (e) => {
                const deltaY = e.changedTouches[0].clientY - touchStartY;
                if (deltaY > 100) { // If swiped down more than 100px
                    fullscreenSidebar.style.display = 'none';
                } else {
                    fullscreenSidebar.style.transform = '';
                }
                touchStartY = 0;
            });
        },

        setupEventListeners() {
            // Handle audio errors
            this.audioElement.addEventListener('error', (e) => {
                if (!this.loading) { // Ignore errors during loading
                    const error = e.target.error;
                    console.error('Audio playback error:', error);
                    
                    if (!this.audioElement.src) {
                        return; // Ignore empty src errors
                    }
                    
                    if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                        this.handlePlaybackError(new Error('Audio format not supported'));
                    } else if (error?.code === MediaError.MEDIA_ERR_NETWORK) {
                        this.handlePlaybackError(new Error('Network error while loading audio'));
                    } else {
                        this.handlePlaybackError(new Error('Failed to load audio'));
                    }
                }
            });

            // Save state before unload
            window.addEventListener('beforeunload', () => {
                if (this.currentTrack) {
                    localStorage.setItem('currentTrack', JSON.stringify({
                        ...this.currentTrack,
                        currentTime: this.audioElement.currentTime
                    }));
                }
            });

            // Setup sidebar panels
            document.querySelectorAll('[data-panel]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const panelName = btn.dataset.panel;
                    const panel = document.querySelector(`.${panelName}-panel`);
                    const sidebar = document.querySelector('.player-sidebar');
                    const title = document.querySelector('.sidebar-title');
                    const panels = document.querySelectorAll('.panel');
                    
                    panels.forEach(p => p.classList.remove('active'));
                    
                    if (panel.classList.contains('active')) {
                        sidebar.classList.remove('active');
                        panel.classList.remove('active');
                    } else {
                        sidebar.classList.add('active');
                        panel.classList.add('active');
                        title.textContent = panelName.charAt(0).toUpperCase() + panelName.slice(1);
                    }
                });
            });

            // Add fullscreen player handlers
            const coverEl = document.querySelector('.current-cover');
            const fullscreenPlayer = document.querySelector('.fullscreen-player');
            const closeFullscreen = document.querySelector('.close-fullscreen');

            coverEl?.addEventListener('click', () => {
                fullscreenPlayer.classList.add('active');
                this.updateFullscreenPlayer();
                document.body.style.overflow = 'hidden';
            });

            closeFullscreen?.addEventListener('click', () => {
                fullscreenPlayer.classList.remove('active');
                const sidebar = document.querySelector('.fullscreen-sidebar');
                sidebar.classList.remove('active');
                document.body.style.overflow = '';
            });

            // Handle tab switching
            document.querySelectorAll('.tab-btn, .mobile-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;
                    const isFullscreen = btn.classList.contains('mobile-btn');
                    
                    if (isFullscreen) {
                        // Show sidebar when clicking mobile buttons
                        const sidebar = document.querySelector('.fullscreen-sidebar');
                        sidebar.style.display = 'flex';
                        
                        // Add a close button for mobile
                        if (!sidebar.querySelector('.mobile-close')) {
                            const closeBtn = document.createElement('button');
                            closeBtn.className = 'mobile-close';
                            closeBtn.innerHTML = '<i class="ri-close-line"></i>';
                            closeBtn.onclick = () => sidebar.style.display = 'none';
                            sidebar.prepend(closeBtn);
                        }
                    }
                    
                    // Update tab buttons
                    document.querySelectorAll('.tab-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.tab === tab);
                    });
                    
                    // Update panels
                    document.querySelectorAll('.tab-panel').forEach(p => {
                        p.classList.toggle('active', p.classList.contains(`${tab}-panel`));
                    });
                });
            });

            // Handle mobile tab buttons
            document.querySelectorAll('.mobile-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sidebar = document.querySelector('.fullscreen-sidebar');
                    const panelName = btn.dataset.tab;
                    const currentPanel = sidebar.querySelector(`.${panelName}-panel`);
                    
                    // If clicking the same button, toggle the sidebar
                    if (sidebar.classList.contains('active') && currentPanel.classList.contains('active')) {
                        sidebar.classList.remove('active');
                    } else {
                        // Show sidebar and switch to selected panel
                        sidebar.classList.add('active');
                        sidebar.querySelectorAll('.tab-panel').forEach(p => {
                            p.classList.toggle('active', p === currentPanel);
                        });
                        sidebar.querySelectorAll('.tab-btn').forEach(b => {
                            b.classList.toggle('active', b.dataset.tab === panelName);
                        });
                    }
                });
            });

            // Handle tab buttons in fullscreen sidebar
            document.querySelectorAll('.fullscreen-tabs .tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const panelName = btn.dataset.tab;
                    const panel = document.querySelector(`.fullscreen-sidebar .${panelName}-panel`);
                    
                    document.querySelectorAll('.fullscreen-sidebar .tab-panel').forEach(p => {
                        p.classList.toggle('active', p === panel);
                    });
                    document.querySelectorAll('.fullscreen-tabs .tab-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.tab === panelName);
                    });
                });
            });

            // Add streaming timer update
            this.audioElement.addEventListener('timeupdate', () => {
                this.streamingTimer.update();
                // ...existing timeupdate code...
                this.savePlayerState();
                this.updateProgress();
            });

            // Reset timer when playback stops
            this.audioElement.addEventListener('pause', () => {
                if (!this.streamingTimer.adBreakActive) {
                    this.streamingTimer.lastCheckpoint = Date.now();
                }
            });

            // Listen for play track events
            document.addEventListener('xm-play-track', (e) => {
                if (e.detail?.audioUrl) {
                    player.playTrack(e.detail);
                } else {
                    console.error('Invalid track data:', e.detail);
                    alert('Invalid track data');
                }
            });

            // Error handling
            player.audioElement.addEventListener('error', (e) => {
                if (e.target.error) {
                    console.error('Audio error:', e.target.error);
                    player.handlePlaybackError(new Error('Failed to load audio'));
                }
            });

            // Setup like button handler
            const likeBtn = document.querySelector('.like-btn');
            if (likeBtn) {
                likeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const songId = likeBtn.dataset.songId;
                    if (!songId) return;

                    const isNowLiked = await toggleLike(songId);
                    const icon = likeBtn.querySelector('i');
                    icon.className = isNowLiked ? 'ri-heart-3-fill' : 'ri-heart-3-line';
                    likeBtn.classList.toggle('active', isNowLiked);
                });
            }

            // Restore previous state
            player.restorePlayerState();
        },

        updateFullscreenPlayer() {
            if (!this.currentTrack) return;

            const cover = document.querySelector('.fullscreen-cover');
            const title = document.querySelector('.fullscreen-title');
            const artist = document.querySelector('.fullscreen-artist');
            const queuePanel = document.querySelector('.fullscreen-sidebar .queue-panel');
            const lyricsPanel = document.querySelector('.fullscreen-sidebar .lyrics-panel');

            cover.style.backgroundImage = `url('${this.currentTrack.coverUrl}')`;
            title.textContent = this.currentTrack.title;
            artist.textContent = this.currentTrack.artist;

            // Clone queue and lyrics content
            const originalQueue = document.querySelector('.player-sidebar .queue-panel');
            const originalLyrics = document.querySelector('.player-sidebar .lyrics-panel');
            
            queuePanel.innerHTML = originalQueue.innerHTML;
            lyricsPanel.innerHTML = originalLyrics.innerHTML;
        },

        setupTouchControls() {
            let touchStartY = 0;
            let initialTransform = 0;
            
            const sidebar = document.querySelector('.fullscreen-sidebar');
            
            sidebar?.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
                initialTransform = sidebar.getBoundingClientRect().top;
                sidebar.style.transition = 'none';
            });
            
            sidebar?.addEventListener('touchmove', (e) => {
                const deltaY = e.touches[0].clientY - touchStartY;
                if (deltaY > 0) { // Only allow downward swipe
                    sidebar.style.transform = `translateY(${deltaY}px)`;
                }
            });
            
            sidebar?.addEventListener('touchend', (e) => {
                sidebar.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                const deltaY = e.changedTouches[0].clientY - touchStartY;
                if (deltaY > 100) {
                    this.closeSidebar();
                } else {
                    sidebar.style.transform = '';
                }
            });
        },

        closeSidebar() {
            const sidebar = document.querySelector('.fullscreen-sidebar');
            sidebar.style.transform = 'translateY(100%)';
            setTimeout(() => {
                sidebar.style.display = 'none';
                sidebar.style.transform = '';
            }, 300);
        },

        setupErrorHandler() {
            window.addEventListener('unhandledrejection', (event) => {
                console.error('Unhandled promise rejection:', event.reason);
                notifications.show('Something went wrong. Please try again.', 'error');
            });
        }
    };

    // Initialize player
    if (player) {
        player.setupProgressBar();
        player.setupVolumeControl();
        player.setupEventListeners();
        player.setupSidebar();
        player.setupTouchControls();
        player.setupErrorHandler();

        // Bind the play/pause button click
        document.querySelector('.play-pause')?.addEventListener('click', () => {
            player.togglePlayPause();
        });

        // Setup other player event listeners
        player.audioElement.addEventListener('timeupdate', () => {
            player.savePlayerState();
            player.updateProgress();
        });

        // Listen for play track events
        document.addEventListener('xm-play-track', (e) => {
            if (e.detail?.audioUrl) {
                player.playTrack(e.detail);
            } else {
                console.error('Invalid track data:', e.detail);
                alert('Invalid track data');
            }
        });

        // Error handling
        player.audioElement.addEventListener('error', (e) => {
            if (e.target.error) {
                console.error('Audio error:', e.target.error);
                player.handlePlaybackError(new Error('Failed to load audio'));
            }
        });

        // Setup like button handler
        const likeBtn = document.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const songId = likeBtn.dataset.songId;
                if (!songId) return;

                const isNowLiked = await toggleLike(songId);
                const icon = likeBtn.querySelector('i');
                icon.className = isNowLiked ? 'ri-heart-3-fill' : 'ri-heart-3-line';
                likeBtn.classList.toggle('active', isNowLiked);
            });
        }

        // Try to restore previous state
        player.restorePlayerState();
    }
    return player;
}