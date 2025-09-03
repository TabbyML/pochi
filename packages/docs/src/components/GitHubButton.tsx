'use client';

import { useGitHubStars } from '@/hooks/useGitHubStars';
import { Github, Star } from 'lucide-react';

interface GitHubButtonProps {
  owner: string;
  repo: string;
  className?: string;
}

export function GitHubButton({ owner, repo, className }: GitHubButtonProps) {
  const { stars, loading } = useGitHubStars(owner, repo);


  const formatStars = (count: number): string => {
    if (count < 1000) return count.toString();
    if (count < 100000) {
      const value = (count / 1000).toFixed(1);
      return value.endsWith('.0') ? value.slice(0, -2) + 'K' : value + 'K';
    }
    if (count < 1000000) {
      return `${Math.floor(count / 1000)}K`;
    }
    return count.toString();
  };

  return (
    <a
      href={`https://github.com/${owner}/${repo}`}
      rel="noreferrer noopener"
      target="_blank"
      className={`flex items-center gap-2 p-2 rounded-lg text-sm text-fd-foreground/80 transition-colors hover:text-fd-accent-foreground hover:bg-fd-accent ${className || ''}`}
    >
      <Github className="size-3.5" />
      <span>{owner}/{repo}</span>
      {!loading && stars !== null && (
        <span className="flex items-center gap-1 text-xs text-fd-muted-foreground">
          <Star className="size-3" />
          {formatStars(stars)}
        </span>
      )}
    </a>
  );
}