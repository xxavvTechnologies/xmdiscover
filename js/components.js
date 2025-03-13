document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Helper function to add delay between operations
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Load header
        const headerResponse = await fetch('../components/header.html');
        const headerText = await headerResponse.text();
        document.body.insertAdjacentHTML('afterbegin', headerText);
        
        await delay(100); // Add small delay between operations

        // Load footer
        const footerResponse = await fetch('../components/footer.html');
        const footerText = await footerResponse.text();
        document.body.insertAdjacentHTML('beforeend', footerText);

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
    } catch (error) {
        console.error('Error loading components:', error);
    }
});
