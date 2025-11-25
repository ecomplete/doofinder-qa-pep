const fs = require('fs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Configuration
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g., 'pep-ecom-qa.myshopify.com'
const STOREFRONT_ACCESS_TOKEN = process.env.STOREFRONT_ACCESS_TOKEN;
const SITE_URL = 'https://pep-ecom-qa.myshopify.com'; // Your public site URL

// GraphQL query for pages
const PAGES_QUERY = `
  query GetPages($cursor: String) {
    pages(first: 250, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          body
          bodySummary
          createdAt
          updatedAt
        }
      }
    }
  }
`;

// Fetch data from Shopify Storefront API
async function fetchShopifyData(query, variables = {}) {
  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Check for GraphQL errors
  if (data.errors) {
    const errorMessages = data.errors.map(e => e.message).join('; ');
    throw new Error(`GraphQL errors: ${errorMessages}`);
  }

  return data;
}

// Fetch all pages with pagination
async function fetchAllPages() {
  let allPages = [];
  let hasNextPage = true;
  let cursor = null;

  console.log('Fetching CMS pages...');
  
  while (hasNextPage) {
    const response = await fetchShopifyData(PAGES_QUERY, { cursor });
    const { edges, pageInfo } = response.data.pages;
    
    allPages = allPages.concat(edges.map(edge => edge.node));
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
    
    console.log(`Fetched ${allPages.length} pages so far...`);
  }

  console.log(`Total pages fetched: ${allPages.length}`);
  return allPages;
}

// Clean HTML content for XML
function cleanContent(html) {
  if (!html) return '';
  
  // Remove HTML tags and decode entities
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Escape XML special characters
function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generate XML feed for CMS pages
function generatePagesXML(pages) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n';
  xml += '  <channel>\n';
  xml += `    <title>Latitudes Online Pages Feed</title>\n`;
  xml += `    <link>${SITE_URL}/pages</link>\n`;
  xml += `    <description>CMS pages for Doofinder</description>\n\n`;

  pages.forEach(page => {
    const url = `${SITE_URL}/pages/${page.handle}`;
    const description = cleanContent(page.bodySummary || page.body);

    xml += '    <item>\n';
    xml += `      <g:id>page_${page.handle}</g:id>\n`;
    xml += `      <title>${escapeXml(page.title)}</title>\n`;
    xml += `      <link>${escapeXml(url)}</link>\n`;
    xml += `      <description>${escapeXml(description)}</description>\n`;
    xml += `      <g:type>cms_page</g:type>\n`;
    
    if (page.updatedAt) {
      xml += `      <pubDate>${new Date(page.updatedAt).toUTCString()}</pubDate>\n`;
    }
    
    xml += '    </item>\n\n';
  });

  xml += '  </channel>\n';
  xml += '</rss>';

  return xml;
}

// Main function
async function main() {
  try {
    console.log('Starting pages feed generation...\n');

    // Validate environment variables
    if (!SHOPIFY_STORE_DOMAIN || !STOREFRONT_ACCESS_TOKEN) {
      throw new Error('Missing required environment variables: SHOPIFY_STORE_DOMAIN and STOREFRONT_ACCESS_TOKEN');
    }

    // Fetch pages only
    const pages = await fetchAllPages();

    console.log(`\nGenerating XML feed...`);
    
    // Generate pages XML
    const pagesXml = generatePagesXML(pages);
    const pagesOutputPath = 'doofinder-pages-feed.xml';
    fs.writeFileSync(pagesOutputPath, pagesXml);

    console.log(`\n✅ Feed generated successfully!`);
    console.log(`\n📄 Pages Feed:`);
    console.log(`   File: ${pagesOutputPath}`);
    console.log(`   Items: ${pages.length} pages`);
    console.log(`   Size: ${(fs.statSync(pagesOutputPath).size / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('❌ Error generating feed:', error.message);
    process.exit(1);
  }
}

main();