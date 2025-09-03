import { useEffect, useState } from 'react';

export function useGitHubStars(owner: string, repo: string) {
  const [stars, setStars] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cacheKey = `github-stars-${owner}-${repo}`;
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    const fetchStars = async () => {
      try {
        // Check localStorage cache first
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            setStars(data);
            setLoading(false);
            return;
          }
        }

        // Fetch from GitHub API
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: {
            'User-Agent': 'pochi-docs',
            'Accept': 'application/vnd.github.v3+json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          const starCount = data.stargazers_count;
          
          // Cache in localStorage
          localStorage.setItem(cacheKey, JSON.stringify({
            data: starCount,
            timestamp: Date.now()
          }));
          
          setStars(starCount);
        } else {
          // If API fails, try to use cached data even if expired
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data } = JSON.parse(cached);
            setStars(data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch GitHub stars:', error);
        
        // Try to use cached data on error
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data } = JSON.parse(cached);
            setStars(data);
          }
        } catch (cacheError) {
          console.error('Failed to read cache:', cacheError);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStars();
  }, [owner, repo]);

  return { stars, loading };
}