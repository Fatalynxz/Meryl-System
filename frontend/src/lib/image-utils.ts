/**
 * Product Image URL utilities
 * Handles extraction from Google/Bing image redirect links and detects webpage links.
 */

export function cleanProductImageUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  let trimmed = String(rawUrl).trim();
  if (!trimmed) return '';

  try {
    // 1. Google Image Search redirect (e.g. google.com/imgres?imgurl=https%3A%2F%2F...)
    if (trimmed.includes('google.') && (trimmed.includes('imgurl=') || trimmed.includes('/url?'))) {
      const parsed = new URL(trimmed);
      const imgurl = parsed.searchParams.get('imgurl');
      if (imgurl) {
        return decodeURIComponent(imgurl);
      }
      const urlParam = parsed.searchParams.get('url');
      if (urlParam && !urlParam.includes('google.')) {
        return decodeURIComponent(urlParam);
      }
    }

    // 2. Bing Image Search redirect (e.g. bing.com/...&mediaurl=https%3A%2F%2F...)
    if (trimmed.includes('bing.com') && trimmed.includes('mediaurl=')) {
      const parsed = new URL(trimmed);
      const mediaUrl = parsed.searchParams.get('mediaurl');
      if (mediaUrl) {
        return decodeURIComponent(mediaUrl);
      }
    }

    // 3. Yahoo image redirect
    if (trimmed.includes('yahoo.com') && trimmed.includes('imgurl=')) {
      const parsed = new URL(trimmed);
      const imgurl = parsed.searchParams.get('imgurl');
      if (imgurl) {
        return decodeURIComponent(imgurl);
      }
    }
  } catch {
    // Fall back to original trimmed string if URL parsing fails
  }

  return trimmed;
}

export function isWebpageUrl(url?: string | null): boolean {
  if (!url) return false;
  const lower = String(url).toLowerCase().trim();
  if (lower.startsWith('data:image/')) return false;

  // Webpage file extensions
  if (/\.(aspx|html|htm|php|jsp|asp|xhtml)(\?.*)?$/i.test(lower)) {
    return true;
  }

  // Common store webpage paths without image file extensions
  if (
    (lower.includes('/shopping/') ||
      lower.includes('/item/') ||
      lower.includes('/product/') ||
      lower.includes('/goods/') ||
      lower.includes('/catalog/')) &&
    !/\.(jpg|jpeg|png|webp|gif|svg|avif)(\?.*)?$/i.test(lower)
  ) {
    return true;
  }

  return false;
}

export function getWebpageUrlWarning(url?: string | null): string | null {
  if (!url || !isWebpageUrl(url)) return null;
  return 'Notice: This link is a webpage link rather than an image file. Right-click the shoe image directly on Google or the webpage and select "Copy image address" (not "Copy link address").';
}

