const fetch = require('node-fetch');

exports.handler = async (event) => {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { url } = event.queryStringParameters;
    
    if (!url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing feed URL parameter' })
        };
    }

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/rss+xml, application/xml, text/xml',
                'User-Agent': 'Mozilla/5.0 (compatible; xMDiscover/1.0;)'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const feedContent = await response.text();

        // Validate that the response is XML
        if (!feedContent.trim().startsWith('<?xml')) {
            throw new Error('Invalid RSS feed: Response is not XML');
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET',
                'Cache-Control': 'public, max-age=3600'
            },
            body: feedContent
        };
    } catch (error) {
        console.error('RSS proxy error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: error.message,
                url: url 
            })
        };
    }
};
