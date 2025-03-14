import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load components
        await Promise.all([
            loadComponent('header'),
            loadComponent('player'),
            loadComponent('footer')
        ]);

        // Initialize player functionality
        initializePlayer();

        // Helper function to add delay between operations
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        await delay(100); // Add small delay between operations

        // Set active nav link with delay
        await delay(100);
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const navLink = document.querySelector(`a[href="${currentPage}"]`);
        if (navLink) {
            navLink.classList.add('active');
        }

        // Set page title and subtitle
        const pageTitles = {
            'index.html': ['Welcome to xM DiScover', 'Your personal journey through millions of tracks'],
            'discover.html': ['Discover New Music', 'Explore new artists and genres'],
            'library.html': ['Your Library', 'Access your favorite music']
        };
        
        const [title, subtitle] = pageTitles[currentPage] || ['', ''];
        const titleElement = document.getElementById('page-title');
        const subtitleElement = document.getElementById('page-subtitle');
        
        if (titleElement && subtitleElement) {
            titleElement.textContent = title;
            subtitleElement.textContent = subtitle;
        }

        // Add auth state handling
        const handleAuth = async () => {
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
                        avatarImg.src = profile.avatar_url || 'images/default-avatar.png';
                        avatarImg.alt = profile.display_name || 'Profile';
                    }
                    if (nameSpan) {
                        nameSpan.textContent = profile.display_name || profile.username;
                    }

                    // Add admin link if admin
                    if (profile.role === 'admin') {
                        const dropdown = document.querySelector('.profile-dropdown');
                        if (dropdown) {
                            dropdown.insertAdjacentHTML('afterbegin', '<a href="admin/index.html">Admin Dashboard</a>');
                        }
                    }
                }

                // Setup logout handler
                document.querySelector('.logout-btn')?.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await supabase.auth.signOut();
                    window.location.reload();
                });

            } else {
                // Show logged out elements, hide logged in elements
                loggedOutElements.forEach(el => el.style.display = 'flex');
                loggedInElements.forEach(el => el.style.display = 'none');
            }
        };

        // Initial auth check
        await handleAuth();

        // Listen for auth changes
        supabase.auth.onAuthStateChange(() => handleAuth());

        // Add profile menu toggle
        document.querySelector('.profile-trigger')?.addEventListener('click', (e) => {
            e.currentTarget.parentElement.classList.toggle('active');
        });

        // Close profile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.profile-menu')) {
                document.querySelector('.profile-menu')?.classList.remove('active');
            }
        });

    } catch (error) {
        console.error('Error loading components:', error);
    }
});

async function loadComponent(name) {
    const response = await fetch(`../components/${name}.html`);
    const html = await response.text();
    const position = name === 'footer' ? 'beforeend' : 'afterbegin';
    document.body.insertAdjacentHTML(position, html);
}

function initializePlayer() {
    // Toggle sidebar
    document.querySelectorAll('[data-panel]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const panelName = e.currentTarget.dataset.panel;
            const sidebar = document.querySelector('.player-sidebar');
            const panels = document.querySelectorAll('.panel');
            
            panels.forEach(panel => {
                panel.classList.toggle('active', 
                    panel.classList.contains(`${panelName}-panel`)
                );
            });
            
            sidebar.classList.add('active');
        });
    });

    // Close sidebar
    document.querySelector('.close-sidebar')?.addEventListener('click', () => {
        document.querySelector('.player-sidebar').classList.remove('active');
    });

    // Handle play/pause
    document.querySelector('.play-pause')?.addEventListener('click', (e) => {
        const icon = e.currentTarget.querySelector('i');
        icon.classList.toggle('fa-play');
        icon.classList.toggle('fa-pause');
    });
}
