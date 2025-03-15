const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    try {
        // Fetch all published artists
        const { data: artists } = await supabase
            .from('artists')
            .select('id')
            .eq('status', 'published');

        // Fetch all published playlists
        const { data: playlists } = await supabase
            .from('playlists')
            .select('id')
            .eq('status', 'published')
            .eq('is_public', true);

        // Fetch all published albums
        const { data: albums } = await supabase
            .from('albums')
            .select('id')
            .eq('status', 'published');

        const baseUrl = 'https://xmdiscover.netlify.app';
        
        // Static routes
        const staticUrls = [
            { url: '/', priority: '1.0' },
            { url: '/discover', priority: '0.9' },
            { url: '/library', priority: '0.8' },
        ];

        // Dynamic routes
        const dynamicUrls = [
            ...artists.map(artist => ({
                url: `/pages/artist?id=${artist.id}`,
                priority: '0.7'
            })),
            ...playlists.map(playlist => ({
                url: `/pages/playlist?id=${playlist.id}`,
                priority: '0.6'
            })),
            ...albums.map(album => ({
                url: `/pages/release?id=${album.id}`,
                priority: '0.6'
            }))
        ];

        const allUrls = [...staticUrls, ...dynamicUrls];

        // Generate sitemap XML
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${allUrls.map(({ url, priority }) => `
    <url>
        <loc>${baseUrl}${url}</loc>
        <changefreq>daily</changefreq>
        <priority>${priority}</priority>
    </url>`).join('')}
</urlset>`;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml'
            },
            body: sitemap
        };
    } catch (error) {
        console.error('Sitemap generation error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to generate sitemap' })
        };
    }
};
