import { supabase, getPagePath } from './supabase.js';
import { searchSong, getLyrics } from './services/genius.js';
import { notifications } from './services/notifications.js';
import { QueueService } from './services/queue.js';
import { Player } from './Player.js'; // Updated import path

// Helper function to normalize paths
function normalizePath(path) {
    // Remove leading slash and .html extension if present
    return path.replace(/^\//, '').replace(/\.html$/, '');
}

// Add file size formatter
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Add WAV file duration calculator
export function getWavDuration(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContext.decodeAudioData(e.target.result, (buffer) => {
                const duration = buffer.duration;
                resolve(duration);
            });
        };
        reader.readAsArrayBuffer(file);
    });
}

// Add better file validation
export function validateAudioFile(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('audio/')) {
            reject(new Error('Invalid file type. Please upload an audio file.'));
            return;
        }

        if (file.size > 41943040) {
            reject(new Error('File size exceeds 40MB limit.'));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(true);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file.slice(0, 4096)); // Read first 4KB to verify file
    });
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

async function initializePlayer() {
    try {
        // Initialize player and store in window for global access
        window.player = new Player();

        // Add click handler for the like button
        const likeButton = document.querySelector('.xm-btn.like');
        if (likeButton) {
            likeButton.addEventListener('click', async () => {
                const songId = likeButton.dataset.songId;
                if (!songId) return;
                
                const isLiked = await toggleLike(songId);
                const icon = likeButton.querySelector('i');
                icon.className = isLiked ? 'ri-heart-3-fill' : 'ri-heart-3-line';
            });
        }

        return window.player;
    } catch (error) {
        console.error('Failed to initialize player:', error);
        return null;
    }
}
